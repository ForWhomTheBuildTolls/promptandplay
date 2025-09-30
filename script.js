const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hudCdo = document.getElementById('hudCdo');
const hudScore = document.getElementById('hudScore');
const hudSpeed = document.getElementById('hudSpeed');
const hudHealth = document.getElementById('hudHealth');

const messagePanel = document.getElementById('messagePanel');
const startButton = document.getElementById('startButton');
const messageTitle = document.getElementById('messageTitle');
const messageBody = document.getElementById('messageBody');
const bigShortOverlay = document.getElementById('bigShortOverlay');
const recoverButton = document.getElementById('recoverButton');
const characterSelect = document.getElementById('characterSelect');
const characterBtns = document.querySelectorAll('.character-btn');
const config = {
  width: canvas.width,
  height: canvas.height,
  groundHeight: 120,
  baseSpeed: 280,
  maxSpeed: 580,
  gravity: 2200,
  jumpVelocity: -920,
  jumpHoldBoost: -1600,
  jumpHoldDuration: 0.2,
  maxFallSpeed: 1400,
  airControl: 0.15,
  confidenceDecayBase: 0.35,
  confidenceDecayRamp: 0.25,
  collectibleValue: 4,
  hazardPenalty: 3,
  hazardHealthPenalty: 5,
  healthMax: 100,
  bigShortPenalty: 20,
  bigShortCdoPenalty: 5,
  platformMinWidth: 250,
  platformMaxWidth: 500,
  platformGapMin: 60,
  platformGapMax: 130,
  platformGapChance: 0.18
};

const state = {
  running: false,
  gameOver: false,
  crashTriggered: false,
  cdoBank: 0,
  distance: 0,
  currentSpeed: config.baseSpeed,
  health: config.healthMax,
  inBigShort: false,
  winAchieved: false,
  speedBoost: 0,
  selectedCharacter: 'sonic',
  spawnTimers: {
    collectible: 0.9,
    hazard: 2.4,
    sinkhole: 8,
    powerUp: 5
  }
};

const speedTrails = [];


function getDifficultyScale() {
  const distance = state.distance || 0;
  const scale = 1 + distance / 6000;
  return Math.min(scale, 2.6);
}

const parallaxLayers = [
  { color: '#12265f', baseHeight: 260, amplitude: 45, speedFactor: 0.12, offset: 0 },
  { color: '#183373', baseHeight: 210, amplitude: 30, speedFactor: 0.2, offset: 0 },
  { color: '#1f4492', baseHeight: 170, amplitude: 22, speedFactor: 0.32, offset: 0 }
];

const platformLevels = [
  config.height - config.groundHeight,
  config.height - config.groundHeight - 130,
  config.height - config.groundHeight - 240
];

const platformThickness = 16;

const platforms = [];

const collectibles = [];
const powerUps = [];
const hazards = [];
const floatingTexts = [];
const particles = [];

let lastTimestamp = performance.now();
let screenShake = 0;
let crashFlash = 0;

class Player {
  constructor() {
    this.width = 58;
    this.height = 72;
    this.reset();
  }

  getCharacterStats() {
    const chars = {
      sonic: { color: '#1b77ff', jumpMult: 1.0, healthMult: 1.0, speedMult: 1.0 },
      tails: { color: '#ff9933', jumpMult: 1.3, healthMult: 0.9, speedMult: 0.95 },
      knuckles: { color: '#ff3333', jumpMult: 0.85, healthMult: 1.3, speedMult: 0.9 },
      shadow: { color: '#333333', jumpMult: 1.0, healthMult: 0.85, speedMult: 1.25 }
    };
    return chars[state.selectedCharacter] || chars.sonic;
  }

  reset() {
    this.x = 160;
    this.y = this.groundY();
    this.vy = 0;
    this.vx = 0;
    this.targetX = 160;
    this.isGrounded = true;
    this.jumpHoldTime = 0;
    this.runCycle = 0;
    this.prevBottom = this.y + this.height;
    this.spinSpeed = 0;
    this.isSpinning = false;
  }

  groundY() {
    return platformLevels[0] - this.height;
  }

  update(delta) {
    this.prevBottom = this.y + this.height;

    // Smooth horizontal position interpolation
    const positionDiff = this.targetX - this.x;
    this.x += positionDiff * Math.min(1, delta * 12);

    // Update spin animation
    if (!this.isGrounded) {
      this.isSpinning = true;
      this.spinSpeed += delta * 18;
    } else if (state.currentSpeed > config.baseSpeed * 1.3) {
      this.isSpinning = true;
      this.spinSpeed += delta * (state.currentSpeed / config.baseSpeed) * 15;
    } else {
      this.isSpinning = false;
      this.spinSpeed = 0;
    }

    if (!this.isGrounded) {
      this.vy += config.gravity * delta;
      if (this.jumpHoldTime > 0) {
        this.vy += config.jumpHoldBoost * delta;
        this.jumpHoldTime -= delta;
      }
      this.vy = Math.min(this.vy, config.maxFallSpeed);
      this.y += this.vy * delta;
    } else {
      this.runCycle += delta * (state.currentSpeed / config.baseSpeed) * 8;
      // Smooth landing
      this.vy = 0;
    }

    // Create speed trails with smoother spawn rate
    if ((this.isSpinning || state.speedBoost > 0) && Math.random() < 0.5) {
      speedTrails.push({
        x: this.x + this.width / 2,
        y: this.y + this.height / 2,
        life: 0.3,
        radius: this.isSpinning ? 25 : 20,
        color: state.speedBoost > 0 ? '#ffdd00' : '#1b77ff'
      });
    }
  }

  jump() {
    if (this.isGrounded) {
      const stats = this.getCharacterStats();
      this.vy = config.jumpVelocity * stats.jumpMult;
      this.isGrounded = false;
      this.jumpHoldTime = config.jumpHoldDuration;
      spawnDust(this.x + this.width * 0.5, this.y + this.height, 10, stats.color);
    }
  }

  getBounds() {
    return {
      x: this.x + 10,
      y: this.y + 8,
      width: this.width - 20,
      height: this.height - 16
    };
  }

  lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return '#' + (0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1);
  }

  darkenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return '#' + (0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);

    // Draw speed boost aura
    if (state.speedBoost > 0) {
      ctx.save();
      ctx.globalAlpha = 0.4 * (state.speedBoost / 3);
      const gradient = ctx.createRadialGradient(0, 0, 20, 0, 0, 50);
      gradient.addColorStop(0, '#ffdd00');
      gradient.addColorStop(1, 'rgba(255, 221, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Apply spinning rotation
    if (this.isSpinning) {
      ctx.rotate(this.spinSpeed);
    }

    ctx.translate(-this.width / 2, -this.height / 2);

    const bounce = Math.sin(this.runCycle) * (this.isGrounded && !this.isSpinning ? 4 : 0);
    ctx.translate(0, bounce * 0.6);

    // Shadow
    if (!this.isSpinning) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#09152e';
      ctx.beginPath();
      ctx.ellipse(this.width * 0.45, this.height + 12, 32, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this.isSpinning) {
      // Spinning ball form
      ctx.save();
      const stats = this.getCharacterStats();
      const baseColor = stats.color;

      // Main ball body with gradient
      const gradient = ctx.createRadialGradient(this.width * 0.5, this.height * 0.5, 10, this.width * 0.5, this.height * 0.5, 36);
      gradient.addColorStop(0, this.lightenColor(baseColor, 30));
      gradient.addColorStop(0.7, baseColor);
      gradient.addColorStop(1, this.darkenColor(baseColor, 30));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.width * 0.5, this.height * 0.5, 36, 0, Math.PI * 2);
      ctx.fill();

      // Spin lines
      ctx.strokeStyle = this.darkenColor(baseColor, 20);
      ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const angle = (this.spinSpeed + (i * Math.PI / 2)) % (Math.PI * 2);
        const x = this.width * 0.5 + Math.cos(angle) * 28;
        const y = this.height * 0.5 + Math.sin(angle) * 28;
        ctx.beginPath();
        ctx.moveTo(this.width * 0.5, this.height * 0.5);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(this.width * 0.5 - 8, this.height * 0.5 - 8, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    } else {
      // Normal running form
      // Body
      ctx.save();
      const stats = this.getCharacterStats();
      const baseColor = stats.color;
      const bodyGradient = ctx.createRadialGradient(this.width * 0.45, this.height * 0.4, 10, this.width * 0.45, this.height * 0.45, 32);
      bodyGradient.addColorStop(0, this.lightenColor(baseColor, 30));
      bodyGradient.addColorStop(0.7, baseColor);
      bodyGradient.addColorStop(1, this.darkenColor(baseColor, 30));
      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.ellipse(this.width * 0.45, this.height * 0.45, 26, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Spikes
      ctx.save();
      ctx.fillStyle = '#0f58d3';
      for (let i = 0; i < 5; i++) {
        const spikeX = this.width * 0.2 + i * 10;
        const spikeY = this.height * 0.2 - Math.sin(this.runCycle + i * 0.6) * 4;
        ctx.beginPath();
        ctx.moveTo(spikeX, spikeY);
        ctx.lineTo(spikeX + 18, spikeY + 8);
        ctx.lineTo(spikeX + 4, spikeY + 22);
        ctx.closePath();
        ctx.fill();

        // Spike highlights
        ctx.fillStyle = 'rgba(100, 180, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(spikeX + 2, spikeY + 2);
        ctx.lineTo(spikeX + 10, spikeY + 6);
        ctx.lineTo(spikeX + 4, spikeY + 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0f58d3';
      }
      ctx.restore();

      // Face mask
      ctx.save();
      ctx.fillStyle = '#ffe0c4';
      ctx.beginPath();
      ctx.ellipse(this.width * 0.6, this.height * 0.4, 16, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      // Face shadow
      ctx.fillStyle = 'rgba(200, 170, 140, 0.3)';
      ctx.beginPath();
      ctx.ellipse(this.width * 0.6, this.height * 0.46, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Eye
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(this.width * 0.72, this.height * 0.32, 8, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#001f4d';
      ctx.beginPath();
      ctx.ellipse(this.width * 0.74, this.height * 0.34, 3.8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eye shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(this.width * 0.73, this.height * 0.31, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Nose
      ctx.save();
      ctx.fillStyle = '#001736';
      ctx.beginPath();
      ctx.ellipse(this.width * 0.88, this.height * 0.42, 4, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Arms
      ctx.save();
      const armGradient = ctx.createLinearGradient(this.width * 0.4, this.height * 0.5, this.width * 0.4, this.height * 0.75);
      armGradient.addColorStop(0, '#1b77ff');
      armGradient.addColorStop(1, '#0f58d3');
      ctx.strokeStyle = armGradient;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      const armSwing = Math.sin(this.runCycle * 1.8) * 12;
      ctx.beginPath();
      ctx.moveTo(this.width * 0.4, this.height * 0.52);
      ctx.lineTo(this.width * 0.4 - armSwing, this.height * 0.75);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.width * 0.66, this.height * 0.52);
      ctx.lineTo(this.width * 0.66 + armSwing, this.height * 0.76);
      ctx.stroke();
      ctx.restore();

      // Legs
      ctx.save();
      const legGradient = ctx.createLinearGradient(this.width * 0.5, this.height * 0.85, this.width * 0.5, this.height + 2);
      legGradient.addColorStop(0, '#123fbd');
      legGradient.addColorStop(1, '#0a2680');
      ctx.strokeStyle = legGradient;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      const legSwing = Math.sin(this.runCycle * 1.4) * 16;
      ctx.beginPath();
      ctx.moveTo(this.width * 0.45, this.height * 0.85);
      ctx.lineTo(this.width * 0.45 - legSwing, this.height + 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.width * 0.65, this.height * 0.85);
      ctx.lineTo(this.width * 0.65 + legSwing, this.height + 2);
      ctx.stroke();
      ctx.restore();

      // Shoes
      ctx.save();
      const shoeGradient = ctx.createRadialGradient(this.width * 0.5, this.height + 6, 5, this.width * 0.5, this.height + 6, 18);
      shoeGradient.addColorStop(0, '#ff4d6d');
      shoeGradient.addColorStop(1, '#ff234f');
      ctx.fillStyle = shoeGradient;
      const shoeBounce = Math.abs(Math.sin(this.runCycle * 1.4)) * 2;
      ctx.beginPath();
      ctx.ellipse(this.width * 0.45 - legSwing, this.height + 6 + shoeBounce, 18, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(this.width * 0.65 + legSwing, this.height + 6 + shoeBounce, 18, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Shoe highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.ellipse(this.width * 0.45 - legSwing - 4, this.height + 4 + shoeBounce, 6, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(this.width * 0.65 + legSwing - 4, this.height + 4 + shoeBounce, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }
}

class Collectible {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 18;
    this.wave = Math.random() * Math.PI * 2;
    this.value = config.collectibleValue;
  }

  update(delta, speed) {
    this.x -= speed * delta;
    this.wave += delta * 4;
  }

  getBounds() {
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      width: this.radius * 2,
      height: this.radius * 2
    };
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.wave) * 6);
    ctx.rotate(this.wave * 0.5);

    // Outer glow
    const gradient = ctx.createRadialGradient(0, 0, 6, 0, 0, this.radius + 12);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.8)');
    gradient.addColorStop(0.4, 'rgba(255, 200, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 12, 0, Math.PI * 2);
    ctx.fill();

    // Ring outer edge
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Ring inner edge
    ctx.strokeStyle = '#ffed4e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 3, 0, Math.PI * 2);
    ctx.stroke();

    // Ring highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, -Math.PI / 2.5, -Math.PI / 6);
    ctx.stroke();

    // CDO text in center
    ctx.fillStyle = '#ffd700';
    ctx.font = '700 12px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText('CDO', 0, 0);
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}

class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 40;
    this.type = type;
    this.wave = Math.random() * Math.PI * 2;

    // Power-up types with Big Short theme
    const types = {
      // POSITIVE (70% spawn rate)
      'burry': { health: 15, cdos: 5, color: '#00ff88', label: 'BURRY', icon: '🤓' },
      'baum': { health: 12, cdos: 3, color: '#00d4ff', label: 'BAUM', icon: '📊' },
      'eisman': { health: 10, cdos: 4, color: '#ff00ff', label: 'EISMAN', icon: '💼' },
      'lippmann': { health: 8, cdos: 6, color: '#ffaa00', label: 'LIPPMANN', icon: '📈' },
      'cds': { health: 20, cdos: 0, color: '#9cff00', label: 'CDS', icon: '🛡️' },

      // NEGATIVE (30% spawn rate)
      'lehman': { health: -15, cdos: -5, color: '#ff4444', label: 'LEHMAN', icon: '💥' },
      'aig': { health: -12, cdos: -4, color: '#ff6666', label: 'AIG', icon: '⚠️' },
      'bear': { health: -10, cdos: -3, color: '#ff8888', label: 'BEAR', icon: '🐻' }
    };

    this.config = types[type];
  }

  update(delta, speed) {
    this.x -= speed * delta;
    this.wave += delta * 3;
  }

  getBounds() {
    return {
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      width: this.width,
      height: this.height
    };
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.wave) * 8);

    const isPositive = this.config.health > 0;

    // Glow effect
    const gradient = ctx.createRadialGradient(0, 0, 10, 0, 0, this.width);
    gradient.addColorStop(0, this.config.color + 'CC');
    gradient.addColorStop(0.5, this.config.color + '66');
    gradient.addColorStop(1, this.config.color + '00');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, this.width, 0, Math.PI * 2);
    ctx.fill();

    // Icon background
    ctx.fillStyle = isPositive ? 'rgba(0, 200, 100, 0.9)' : 'rgba(255, 50, 50, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = this.config.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();

    // Icon
    ctx.font = '22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.config.icon, 0, 1);

    // Label below
    ctx.font = '700 9px "Chakra Petch", sans-serif';
    ctx.fillStyle = this.config.color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(this.config.label, 0, 28);
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}

class Hazard {
  constructor(x, platformY, type = 'subprime') {
    this.x = x;
    this.width = type === 'short' ? 62 : 68;
    this.height = type === 'air' ? 64 : 78;
    this.wave = Math.random() * Math.PI * 2;
    this.penalty = config.hazardPenalty;
    this.healthHit = config.hazardHealthPenalty;
    this.platformY = platformY;
    this.type = type;
  }

  get y() {
    if (this.type === 'air') {
      return this.platformY - this.height - 60 + Math.sin(this.wave) * 10;
    }
    return this.platformY - this.height + Math.sin(this.wave) * 4;
  }

  update(delta, speed) {
    this.x -= speed * delta;
    this.wave += delta * (this.type === 'air' ? 2 : 3);
  }

  getBounds() {
    return {
      x: this.x + 8,
      y: this.y + 6,
      width: this.width - 16,
      height: this.height - 12
    };
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.font = '700 16px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';

    if (this.type === 'air') {
      ctx.fillStyle = '#ffc857';
      drawRoundedRect(ctx, 0, 0, this.width, this.height, 18);
      ctx.fill();
      ctx.fillStyle = '#1c2048';
      ctx.fillText('HEDGE', this.width / 2, this.height / 2 + 3);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(10, 8, this.width - 20, 6);
    } else if (this.type === 'short') {
      ctx.fillStyle = '#21c4ff';
      drawRoundedRect(ctx, 0, 0, this.width, this.height, 16);
      ctx.fill();
      ctx.fillStyle = '#092d66';
      ctx.fillText('SHORT', this.width / 2, this.height / 2 - 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('SELLER', this.width / 2, this.height / 2 + 18);
    } else {
      ctx.fillStyle = '#ff4d6d';
      drawRoundedRect(ctx, 0, 0, this.width, this.height, 18);
      ctx.fill();
      ctx.fillStyle = '#ff9eaa';
      ctx.fillRect(8, 12, this.width - 16, 16);
      ctx.fillStyle = '#0a0f2e';
      ctx.fillText('SUBPRIME', this.width / 2, 26);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(16, this.height - 28, this.width - 32, 12);
      ctx.fillStyle = '#0a0f2e';
      ctx.fillText('AAA*', this.width / 2, this.height - 14);
    }

    ctx.restore();
  }
}

class FloatingText {
  constructor(text, x, y, color) {
    this.text = text;
    this.x = x;
    this.y = y;
    this.color = color;
    this.life = 1;
  }

  update(delta) {
    this.y -= delta * 60;
    this.life -= delta;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(this.life, 0);
    ctx.fillStyle = this.color;
    ctx.font = '700 18px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, color, vx = null, vy = null) {
    this.x = x;
    this.y = y;
    this.vx = vx !== null ? vx : (Math.random() - 0.5) * 220;
    this.vy = vy !== null ? vy : -Math.random() * 220;
    this.life = 0.6;
    this.maxLife = 0.6;
    this.color = color;
    this.radius = 4;
  }

  update(delta) {
    this.vy += config.gravity * 0.4 * delta;
    this.x += this.vx * delta;
    this.y += this.vy * delta;
    this.life -= delta;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(this.life / this.maxLife, 0);

    // Draw glow
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 2);
    gradient.addColorStop(0, this.color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw core
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

class PlatformSegment {
  constructor(x, width, levelIndex) {
    this.x = x;
    this.width = width;
    this.levelIndex = levelIndex;
    this.y = platformLevels[levelIndex];
  }

  get top() {
    return this.y;
  }

  update(delta, speed) {
    this.x -= speed * delta;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.levelIndex === 0) {
      const grassHeight = 18;
      const soilDepth = Math.min(96, config.height - this.y);

      const soilGradient = ctx.createLinearGradient(0, 0, 0, soilDepth);
      soilGradient.addColorStop(0, '#3b1f05');
      soilGradient.addColorStop(0.45, '#2d1603');
      soilGradient.addColorStop(1, '#1b1208');
      ctx.fillStyle = soilGradient;
      ctx.fillRect(0, 0, this.width, soilDepth);

      ctx.fillStyle = 'rgba(10, 6, 3, 0.4)';
      for (let i = 8; i < this.width - 12; i += 26) {
        const noise = Math.sin((this.x + i) * 0.17);
        const nuance = Math.cos((this.x + i) * 0.11);
        const pebbleWidth = 10 + (noise + 1) * 6;
        const pebbleHeight = 6 + (nuance + 1) * 4;
        const y = 18 + (Math.sin((this.x + i) * 0.09) + 1) * (soilDepth - 36) * 0.5;
        ctx.beginPath();
        ctx.ellipse(i, y, pebbleWidth * 0.5, pebbleHeight * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const grassGradient = ctx.createLinearGradient(0, -14, 0, grassHeight);
      grassGradient.addColorStop(0, '#3eff94');
      grassGradient.addColorStop(0.5, '#16d873');
      grassGradient.addColorStop(1, '#066539');
      ctx.fillStyle = grassGradient;
      ctx.fillRect(-3, -14, this.width + 6, grassHeight);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      for (let i = -2; i < this.width + 4; i += 18) {
        const bladeNoise = Math.sin((this.x + i) * 0.21);
        const bladeHeight = 10 + (bladeNoise + 1) * 4;
        ctx.beginPath();
        ctx.moveTo(i, -2);
        ctx.lineTo(i + 3, -bladeHeight);
        ctx.lineTo(i + 6, -2);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(3, 5, 12, 0.65)';
      ctx.fillRect(-5, 0, 5, soilDepth);
      ctx.fillRect(this.width, 0, 5, soilDepth);
    } else {
      const palettes = [
        { top: 'rgba(0, 240, 255, 0.85)', bottom: 'rgba(8, 28, 52, 0.95)', accent: 'rgba(0, 255, 214, 0.55)', support: 'rgba(0, 180, 255, 0.28)' },
        { top: 'rgba(255, 214, 126, 0.86)', bottom: 'rgba(44, 22, 78, 0.92)', accent: 'rgba(255, 236, 190, 0.5)', support: 'rgba(255, 198, 120, 0.28)' },
        { top: 'rgba(255, 143, 239, 0.85)', bottom: 'rgba(60, 20, 88, 0.92)', accent: 'rgba(255, 208, 255, 0.52)', support: 'rgba(255, 138, 255, 0.28)' }
      ];
      const swatch = palettes[Math.min(palettes.length - 1, this.levelIndex - 1)];

      const gradient = ctx.createLinearGradient(0, -platformThickness, 0, 8);
      gradient.addColorStop(0, swatch.top);
      gradient.addColorStop(1, swatch.bottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, -platformThickness, this.width, platformThickness + 6);

      ctx.fillStyle = swatch.accent;
      ctx.fillRect(0, -platformThickness, this.width, 2);

      ctx.strokeStyle = swatch.support;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.moveTo(0, -platformThickness + 4);
      ctx.lineTo(this.width, -platformThickness + 4);
      ctx.stroke();
      ctx.setLineDash([]);

      const drop = Math.min(52, Math.max(18, platformLevels[0] - this.y));
      ctx.strokeStyle = 'rgba(6, 12, 26, 0.6)';
      ctx.lineWidth = 2;
      for (let i = 16; i < this.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 6);
        ctx.lineTo(i, drop);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

const player = new Player();

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function choosePlatformSegment(x, preference = 'low') {
  const buffer = 30;
  const candidates = platforms
    .filter(platform => x >= platform.x - buffer && x <= platform.x + platform.width + buffer)
    .sort((a, b) => a.top - b.top);
  if (!candidates.length) {
    return null;
  }
  if (preference === 'high') {
    return candidates[0];
  }
  if (preference === 'mid' && candidates.length > 1) {
    return candidates[Math.min(1, candidates.length - 1)];
  }
  return candidates[candidates.length - 1];
}

function getLastEndForLevel(level) {
  let maxEnd = -Infinity;
  for (const platform of platforms) {
    if (platform.levelIndex === level) {
      const end = platform.x + platform.width;
      if (end > maxEnd) {
        maxEnd = end;
      }
    }
  }
  return maxEnd === -Infinity ? -config.width : maxEnd;
}

function ensureLevelCoverage(level) {
  const coverageLimit = config.width + 480;
  let lastEnd = getLastEndForLevel(level);
  if (lastEnd < -config.width + 10) {
    lastEnd = -config.width;
  }
  while (lastEnd < coverageLimit) {
    const difficulty = getDifficultyScale();
    const wideGapChance = Math.min(0.18 + (difficulty - 1) * 0.22, 0.62);
    const longGapMax = 200 + (difficulty - 1) * 70;
    const standardGapMax = 90 + (difficulty - 1) * 28;
    const verticalGap = Math.max(150, 250 - (difficulty - 1) * 30);

    const gap = level === 0
      ? (Math.random() < wideGapChance ? randomBetween(130, longGapMax) : randomBetween(40, standardGapMax))
      : randomBetween(140, verticalGap);
    lastEnd += gap;
    const width = level === 0
      ? randomBetween(config.platformMinWidth, config.platformMaxWidth + (difficulty - 1) * 30)
      : randomBetween(130, 240);
    platforms.push(new PlatformSegment(lastEnd, width, level));
    lastEnd += width;
  }
}

function updatePlatforms(delta) {
  for (let i = platforms.length - 1; i >= 0; i -= 1) {
    const segment = platforms[i];
    const speedFactor = segment.levelIndex === 0 ? 1 : 0.9;
    segment.update(delta, state.currentSpeed * speedFactor);
    if (segment.x + segment.width < -260) {
      platforms.splice(i, 1);
    }
  }
  for (let level = 0; level < platformLevels.length; level += 1) {
    ensureLevelCoverage(level);
  }
}

function resolvePlatformCollisions() {
  const feet = player.y + player.height;
  const bounds = player.getBounds();
  const wasGrounded = player.isGrounded;
  let landingPlatform = null;

  for (const platform of platforms) {
    const top = platform.top;
    if (bounds.x + bounds.width > platform.x + 6 && bounds.x < platform.x + platform.width - 6) {
      if (player.vy >= 0 && feet >= top - 6 && player.prevBottom <= top + 12) {
        if (!landingPlatform || top < landingPlatform.top) {
          landingPlatform = platform;
        }
      }
    }
  }

  if (landingPlatform) {
    // Smooth landing transition
    const targetY = landingPlatform.top - player.height;
    if (player.y > targetY) {
      player.y = targetY;
    }

    if (!wasGrounded) {
      spawnDust(player.x + player.width * 0.6, player.y + player.height, 6, '#5ae9ff');
    }
    player.vy = 0;
    player.isGrounded = true;
    player.jumpHoldTime = 0;
  } else {
    player.isGrounded = false;
  }
}

function initializePlatforms() {
  platforms.length = 0;
  for (let level = 0; level < platformLevels.length; level += 1) {
    const coverageLimit = config.width + 360;
    let cursor = -config.width;
    while (cursor < coverageLimit) {
      const width = level === 0
        ? randomBetween(config.platformMinWidth, config.platformMaxWidth)
        : randomBetween(150, 240);
      platforms.push(new PlatformSegment(cursor, width, level));
      cursor += width;
      const gap = level === 0
        ? randomBetween(40, 90)
        : randomBetween(120, 210);
      if (level === 0 && Math.random() < 0.15) {
        cursor += randomBetween(130, 200);
      } else {
        cursor += gap;
      }
    }
  }
}


function spawnSinkhole() {
  const upcoming = platforms
    .filter(segment => segment.levelIndex === 0 && segment.x > player.x + 120)
    .sort((a, b) => a.x - b.x)[0];
  if (!upcoming) {
    return;
  }
  const difficulty = getDifficultyScale();
  const maxWidthBoost = Math.min(120, (difficulty - 1) * 60);
  const holeWidth = randomBetween(120, 180 + maxWidthBoost);
  if (upcoming.width < holeWidth + 120) {
    return;
  }
  const holeStart = upcoming.x + Math.max(70, upcoming.width - holeWidth - 50);
  const holeEnd = holeStart + holeWidth;
  const leftWidth = Math.max(70, holeStart - upcoming.x);
  upcoming.width = leftWidth;

  for (let i = platforms.length - 1; i >= 0; i -= 1) {
    const segment = platforms[i];
    if (segment.levelIndex === 0 && segment !== upcoming) {
      if (segment.x < holeEnd && segment.x + segment.width > holeStart) {
        const leftOverlap = holeStart - segment.x;
        const rightOverlap = segment.x + segment.width - holeEnd;
        if (leftOverlap > 90 && rightOverlap > 90) {
          segment.width = leftOverlap;
          const newSegment = new PlatformSegment(holeEnd, rightOverlap, 0);
          platforms.push(newSegment);
        } else if (leftOverlap > 90) {
          segment.width = leftOverlap;
        } else if (rightOverlap > 90) {
          segment.x = holeEnd;
          segment.width = rightOverlap;
        } else {
          platforms.splice(i, 1);
        }
      }
    }
  }

  const bridgeLevel = difficulty > 1.6 ? 2 : Math.random() < 0.6 ? 1 : 2;
  const bridgeWidth = holeWidth + randomBetween(60, 140 + maxWidthBoost * 0.5);
  const bridgeStart = holeStart - randomBetween(20, 50);
  platforms.push(new PlatformSegment(bridgeStart, bridgeWidth, bridgeLevel));

  if (difficulty > 1.4 && Math.random() < 0.45) {
    const hazardX = holeStart + holeWidth * 0.5;
    hazards.push(new Hazard(hazardX, platformLevels[Math.min(2, bridgeLevel)], bridgeLevel === 2 ? 'air' : 'short'));
  }
}

function reinforceGroundUnderPlayer() {
  const safetySegment = new PlatformSegment(player.x - 160, 420, 0);
  platforms.push(safetySegment);
}

function spawnDust(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 100 + Math.random() * 120;
    const particle = new Particle(
      x + Math.random() * 8,
      y + Math.random() * 6,
      color,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - 50
    );
    particle.radius = 2 + Math.random() * 3;
    particles.push(particle);
  }
}

function spawnCollectible() {
  const x = config.width + 140;
  const preference = Math.random() < 0.35 ? 'high' : Math.random() < 0.6 ? 'mid' : 'low';
  const platform = choosePlatformSegment(x, preference) || choosePlatformSegment(x, 'low');
  const platformTop = platform ? platform.top : platformLevels[0];
  const y = platformTop - 60 - Math.random() * 40;
  collectibles.push(new Collectible(x, y));
}

function spawnPowerUp() {
  const x = config.width + 180;
  const preference = Math.random() < 0.5 ? 'mid' : 'low';
  const platform = choosePlatformSegment(x, preference) || choosePlatformSegment(x, 'low');
  const platformTop = platform ? platform.top : platformLevels[0];
  const y = platformTop - 70;

  // 70% positive, 30% negative
  const positiveTypes = ['burry', 'baum', 'eisman', 'lippmann', 'cds'];
  const negativeTypes = ['lehman', 'aig', 'bear'];

  const isPositive = Math.random() < 0.7;
  const type = isPositive
    ? positiveTypes[Math.floor(Math.random() * positiveTypes.length)]
    : negativeTypes[Math.floor(Math.random() * negativeTypes.length)];

  powerUps.push(new PowerUp(x, y, type));
}

function spawnHazard() {
  const difficulty = getDifficultyScale();
  const x = config.width + 160 + Math.random() * 80;
  let type = 'subprime';
  const roll = Math.random();
  if (roll > 0.8 && roll <= 0.93) {
    type = 'short';
  } else if (roll > 0.93) {
    type = 'air';
  }
  const preference = type === 'air' ? 'mid' : 'low';
  const platform = choosePlatformSegment(x, preference) || choosePlatformSegment(x, 'low');
  const platformTop = platform ? platform.top : platformLevels[Math.min(platformLevels.length - 1, type === 'air' ? 1 : 0)];
  hazards.push(new Hazard(x, platformTop, type));

  if (difficulty > 1.7 && Math.random() < 0.32) {
    const offset = randomBetween(120, 220);
    const secondaryType = type === 'air' && Math.random() < 0.5 ? 'air' : 'short';
    const secondaryPref = secondaryType === 'air' ? 'mid' : 'low';
    const secondaryPlatform = choosePlatformSegment(x + offset, secondaryPref) || choosePlatformSegment(x + offset, 'low');
    const secondaryTop = secondaryPlatform ? secondaryPlatform.top : platformTop;
    hazards.push(new Hazard(x + offset, secondaryTop, secondaryType));
  }
}

function resetGame() {
  const stats = player.getCharacterStats();
  state.cdoBank = 35;
  state.distance = 0;
  state.currentSpeed = config.baseSpeed * stats.speedMult;
  state.speedBoost = 0;
  state.spawnTimers.collectible = 0.35;
  state.spawnTimers.hazard = 2.2;
  state.spawnTimers.sinkhole = 10;
  state.spawnTimers.powerUp = 4.5;
  state.gameOver = false;
  state.crashTriggered = false;
  state.inBigShort = false;
  state.winAchieved = false;
  state.health = Math.round(config.healthMax * stats.healthMult);
  collectibles.length = 0;
  powerUps.length = 0;
  hazards.length = 0;
  floatingTexts.length = 0;
  particles.length = 0;
  speedTrails.length = 0;
  screenShake = 0;
  crashFlash = 0;
  initializePlatforms();
  player.reset();
  bigShortOverlay.classList.remove('visible');
  updateHud();
}

function updateHud() {
  hudCdo.textContent = state.cdoBank.toString();
  hudScore.textContent = `${Math.max(0, Math.floor(state.distance))} m`;
  hudHealth.textContent = `${Math.max(0, Math.round(state.health))}%`;

  // Update speed indicator
  if (state.speedBoost > 0) {
    hudSpeed.textContent = 'BOOST!';
    hudSpeed.style.color = '#ffdd00';
    hudSpeed.style.textShadow = '0 0 15px rgba(255, 221, 0, 0.8)';
  } else {
    hudSpeed.textContent = 'Normal';
    hudSpeed.style.color = '#73ffbf';
    hudSpeed.style.textShadow = '0 2px 8px rgba(0, 0, 0, 0.6)';
  }

  // Color CDOs based on count
  if (state.cdoBank >= 30) {
    hudCdo.style.color = '#9cff00';
  } else if (state.cdoBank >= 20) {
    hudCdo.style.color = '#ffd700';
  } else if (state.cdoBank >= 10) {
    hudCdo.style.color = '#ffe066';
  } else if (state.cdoBank >= 5) {
    hudCdo.style.color = '#ff9f43';
  } else {
    hudCdo.style.color = '#ff5678';
  }

  hudHealth.style.color = getHealthColor();
}

function getRiskLevel() {
  if (state.cdoBank >= 28) {
    return { label: 'Booming', color: '#9cff00' };
  }
  if (state.cdoBank >= 18) {
    return { label: 'Stable', color: '#73ffbf' };
  }
  if (state.cdoBank >= 10) {
    return { label: 'Watchlist', color: '#ffe066' };
  }
  if (state.cdoBank >= 5) {
    return { label: 'Stressed', color: '#ff9f43' };
  }
  return { label: 'Toxic', color: '#ff5678' };
}

function getHealthColor() {
  if (state.health >= 80) {
    return '#9cff00';
  }
  if (state.health >= 55) {
    return '#73ffbf';
  }
  if (state.health >= 35) {
    return '#ffe066';
  }
  if (state.health > 0) {
    return '#ff9f43';
  }
  return '#ff5678';
}

function showMessage(title, body, buttonLabel) {
  messageTitle.textContent = title;
  messageBody.innerHTML = body;
  startButton.textContent = buttonLabel;
  messagePanel.classList.add('visible');
}

function hideMessage() {
  messagePanel.classList.remove('visible');
}

function addFloatingText(text, x, y, color) {
  floatingTexts.push(new FloatingText(text, x, y, color));
}

function handleCollectibleCollision(collectible) {
  state.cdoBank += collectible.value;
  state.distance += 5;
  if (state.health < config.healthMax) {
    state.health = Math.min(config.healthMax, state.health + 2);
    addFloatingText('+2% confidence', collectible.x, collectible.y - 32, '#9cff00');
  }

  // Every 10 CDOs collected gives a speed boost
  if (state.cdoBank % 10 === 0 && state.cdoBank > 0) {
    state.speedBoost = 3;
    addFloatingText('SPEED BOOST!', collectible.x, collectible.y - 50, '#ffdd00');
  }

  addFloatingText(`+${collectible.value}`, collectible.x, collectible.y - 12, '#ffd700');
  spawnRingCollectEffect(collectible.x, collectible.y);
  updateHud();
}

function spawnRingCollectEffect(x, y) {
  // Create sparkle effect
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const particle = new Particle(
      x,
      y,
      i % 2 === 0 ? '#ffd700' : '#ffed4e',
      Math.cos(angle) * 180,
      Math.sin(angle) * 180
    );
    particle.life = 0.5;
    particle.maxLife = 0.5;
    particle.radius = 3;
    particles.push(particle);
  }
}

function handlePowerUpCollision(powerUp) {
  const config = powerUp.config;
  const isPositive = config.health > 0;

  // Apply effects
  state.health = Math.max(0, Math.min(100, state.health + config.health));
  state.cdoBank = Math.max(0, state.cdoBank + config.cdos);

  // Visual feedback
  if (isPositive) {
    addFloatingText(config.label + '!', powerUp.x, powerUp.y - 20, config.color);
    if (config.health > 0) {
      addFloatingText(`+${config.health}% Health`, powerUp.x, powerUp.y - 40, '#9cff00');
    }
    if (config.cdos > 0) {
      addFloatingText(`+${config.cdos} CDOs`, powerUp.x, powerUp.y - 60, '#ffd700');
    }
    spawnDust(powerUp.x, powerUp.y, 15, config.color);
  } else {
    addFloatingText(config.label + '!', powerUp.x, powerUp.y - 20, config.color);
    addFloatingText(`${config.health}% Health`, powerUp.x, powerUp.y - 40, '#ff4444');
    if (config.cdos < 0) {
      addFloatingText(`${config.cdos} CDOs`, powerUp.x, powerUp.y - 60, '#ff6666');
    }
    spawnDust(powerUp.x, powerUp.y, 15, '#ff577d');
    screenShake = Math.min(8, screenShake + 6);
    crashFlash = 0.5;
  }

  updateHud();

  if (state.health <= 0) {
    triggerCrash('confidence');
  } else if (state.cdoBank <= 0) {
    triggerCrash('liquidity');
  }
}

function handleHazardCollision(hazard) {
  state.cdoBank = Math.max(0, state.cdoBank - hazard.penalty);
  state.health = Math.max(0, state.health - hazard.healthHit);
  addFloatingText(`-${hazard.penalty} CDOs`, hazard.x + hazard.width / 2, hazard.y - 10, '#ff4d6d');
  addFloatingText(`-${hazard.healthHit}% confidence`, hazard.x + hazard.width / 2, hazard.y - 28, '#ffe066');
  spawnDust(hazard.x + hazard.width / 2, hazard.y + hazard.height / 2, 12, '#ff577d');
  screenShake = Math.min(12, screenShake + 8);
  crashFlash = 0.7;
  updateHud();
  if (state.winAchieved) {
    return;
  }
  if (state.health <= 0) {
    triggerCrash('confidence');
    return;
  }
  if (state.cdoBank <= 0) {
    triggerCrash('liquidity');
  }
}

function triggerBigShortFall() {
  if (state.inBigShort || state.crashTriggered || state.winAchieved) {
    return;
  }
  state.inBigShort = true;
  state.running = false;
  bigShortOverlay.classList.add('visible');
  state.health = Math.max(0, state.health - config.bigShortPenalty);
  state.cdoBank = Math.max(0, state.cdoBank - config.bigShortCdoPenalty);
  player.vy = 0;
  player.y = config.height + 80;
  player.prevBottom = player.y + player.height;
  screenShake = 16;
  crashFlash = 0.9;
  addFloatingText("There's a bubble!", player.x + player.width * 0.5, platformLevels[0] - 60, '#ffe066');
  updateHud();
  if (state.health <= 0) {
    triggerCrash('confidence');
    return;
  }
  if (state.cdoBank <= 0) {
    triggerCrash('bubble');
  }
}

function triggerWin() {
  if (state.winAchieved) {
    return;
  }
  state.running = false;
  state.gameOver = true;
  state.winAchieved = true;
  state.crashTriggered = false;
  state.inBigShort = false;
  bigShortOverlay.classList.remove('visible');
  const distance = Math.floor(state.distance);
  const cdos = state.cdoBank;
  setTimeout(() => {
    showMessage(
      '🏛️ Government Bailout Secured! 🏛️',
      `Congratulations! After ${distance} chaotic market meters, you're officially <strong>"Too Big To Fail"</strong>.<br/><br/>
      💰 Treasury grants you <strong>$${cdos} billion</strong> in emergency funding<br/>
      📜 Congress passes the <strong>Emergency Economic Stabilization Act</strong><br/>
      🎖️ You receive a taxpayer-funded golden parachute<br/><br/>
      <em>"The government has determined that your reckless behavior is essential to the economy."</em><br/><br/>
      Moral hazard has never felt so good!`,
      'Accept Taxpayer Money & Restart'
    );
  }, 350);
}

function triggerCrash(reason = 'liquidity') {
  if (state.crashTriggered || state.winAchieved) {
    return;
  }
  state.running = false;
  state.gameOver = true;
  state.crashTriggered = true;
  state.inBigShort = false;
  bigShortOverlay.classList.remove('visible');
  const distance = Math.floor(state.distance);
  let title = '2008 Redux';
  let body = `The mortgage market imploded after ${distance} market meters.<br/>Liquidity vanished, CDO reserves hit zero, and contagion spread globally.`;
  let button = 'Reinflate the Bubble';

  if (reason === 'confidence') {
    title = 'Confidence Collapse';
    body = `After ${distance} frantic meters the street lost faith.<br/>Counterparties walked, liquidity froze, and the desk went dark.`;
    button = 'Rebuild Trust';
  } else if (reason === 'bubble') {
    title = 'The Bubble Bursts';
    body = `There's a bubble! echoes across the trading floor.<br/>Structural support failed and the market cratered.`;
    button = 'Search for Alpha';
  }

  setTimeout(() => {
    showMessage(title, body, button);
  }, 450);
}

function updateGame(delta) {
  updatePlatforms(delta);

  state.spawnTimers.collectible -= delta;
  state.spawnTimers.hazard -= delta;
  state.spawnTimers.sinkhole -= delta;
  state.spawnTimers.powerUp -= delta;

  if (state.spawnTimers.collectible <= 0) {
    spawnCollectible();
    const difficulty = getDifficultyScale();
    state.spawnTimers.collectible = (0.35 + Math.random() * 0.5) / Math.min(1.3, difficulty);
  }
  if (state.spawnTimers.hazard <= 0) {
    spawnHazard();
    const difficulty = getDifficultyScale();
    state.spawnTimers.hazard = (2.0 + Math.random() * 1.5) / Math.max(1, difficulty * 0.85);
  }
  if (state.spawnTimers.sinkhole <= 0) {
    spawnSinkhole();
    const difficulty = getDifficultyScale();
    state.spawnTimers.sinkhole = (10 + Math.random() * 6) / Math.max(1, difficulty * 0.7);
  }
  if (state.spawnTimers.powerUp <= 0) {
    spawnPowerUp();
    state.spawnTimers.powerUp = 5 + Math.random() * 3;
  }

  // Handle speed boost
  if (state.speedBoost > 0) {
    state.speedBoost -= delta;
    if (state.speedBoost < 0) state.speedBoost = 0;
  }

  const baseTargetSpeed = config.baseSpeed + Math.min(state.distance * 1.6, config.maxSpeed - config.baseSpeed);
  const targetSpeed = state.speedBoost > 0 ? baseTargetSpeed * 1.5 : baseTargetSpeed;
  // Smoother speed transitions
  state.currentSpeed += (targetSpeed - state.currentSpeed) * Math.min(1, delta * 1.2);

  player.update(delta);
  resolvePlatformCollisions();

  // Update speed trails
  for (let i = speedTrails.length - 1; i >= 0; i--) {
    speedTrails[i].life -= delta * 2;
    if (speedTrails[i].life <= 0) {
      speedTrails.splice(i, 1);
    }
  }

  if (!state.inBigShort && !state.crashTriggered && player.y > config.height + 60) {
    triggerBigShortFall();
  }

  const playerBounds = player.getBounds();

  for (let i = collectibles.length - 1; i >= 0; i -= 1) {
    const collectible = collectibles[i];
    collectible.update(delta, state.currentSpeed * 0.75);
    if (collectible.x < -80) {
      collectibles.splice(i, 1);
      continue;
    }
    if (intersects(playerBounds, collectible.getBounds())) {
      collectibles.splice(i, 1);
      handleCollectibleCollision(collectible);
    }
  }

  for (let i = powerUps.length - 1; i >= 0; i -= 1) {
    const powerUp = powerUps[i];
    powerUp.update(delta, state.currentSpeed * 0.8);
    if (powerUp.x < -80) {
      powerUps.splice(i, 1);
      continue;
    }
    if (intersects(playerBounds, powerUp.getBounds())) {
      powerUps.splice(i, 1);
      handlePowerUpCollision(powerUp);
    }
  }

  for (let i = hazards.length - 1; i >= 0; i -= 1) {
    const hazard = hazards[i];
    hazard.update(delta, state.currentSpeed);
    if (hazard.x < -140) {
      hazards.splice(i, 1);
      continue;
    }
    if (intersects(playerBounds, hazard.getBounds())) {
      hazards.splice(i, 1);
      handleHazardCollision(hazard);
    }
  }

  for (let i = floatingTexts.length - 1; i >= 0; i -= 1) {
    const fx = floatingTexts[i];
    fx.update(delta);
    if (fx.life <= 0) {
      floatingTexts.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.update(delta);
    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }

  if (!state.crashTriggered && !state.winAchieved) {
    const difficulty = getDifficultyScale();
    const decayRate = config.confidenceDecayBase + Math.max(0, difficulty - 1) * config.confidenceDecayRamp;
    state.health = Math.max(0, state.health - decayRate * delta);
    if (state.health <= 0) {
      triggerCrash('confidence');
      return;
    }
  }

  state.distance += (state.currentSpeed * delta) / 4.5;
  if (!state.winAchieved && state.distance >= 20000) {
    triggerWin();
  }
  updateHud();
}

function drawBackground(delta) {
  const gradient = ctx.createLinearGradient(0, 0, 0, config.height);
  gradient.addColorStop(0, '#061031');
  gradient.addColorStop(0.6, '#0a1c4a');
  gradient.addColorStop(1, '#081530');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, config.width, config.height);

  parallaxLayers.forEach(layer => {
    layer.offset = (layer.offset + delta * state.currentSpeed * layer.speedFactor) % config.width;
    ctx.save();
    ctx.translate(-layer.offset, 0);
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(-config.width, config.height);
    const baseline = config.height - layer.baseHeight;
    for (let x = -config.width; x <= config.width * 2; x += 40) {
      const y = baseline - Math.sin((x / config.width) * Math.PI * 2) * layer.amplitude;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(config.width * 2, config.height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  // Subterranean void
  ctx.save();
  const groundY = config.height - config.groundHeight;
  const voidGradient = ctx.createLinearGradient(0, groundY, 0, config.height + 80);
  voidGradient.addColorStop(0, 'rgba(8, 12, 28, 0.85)');
  voidGradient.addColorStop(0.5, 'rgba(4, 6, 16, 0.95)');
  voidGradient.addColorStop(1, 'rgba(1, 2, 8, 1)');
  ctx.fillStyle = voidGradient;
  ctx.fillRect(0, groundY, config.width, config.groundHeight + 100);
  ctx.restore();
}

function drawGame(delta) {
  if (screenShake > 0) {
    screenShake = Math.max(0, screenShake - delta * 12);
  }
  if (crashFlash > 0) {
    crashFlash = Math.max(0, crashFlash - delta * 0.55);
  }

  const shakeX = screenShake ? (Math.random() - 0.5) * screenShake : 0;
  const shakeY = screenShake ? (Math.random() - 0.5) * screenShake : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBackground(delta);

  // Draw speed trails
  speedTrails.forEach(trail => {
    ctx.save();
    ctx.globalAlpha = trail.life * 0.4;
    const gradient = ctx.createRadialGradient(trail.x, trail.y, 0, trail.x, trail.y, trail.radius);
    gradient.addColorStop(0, trail.color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(trail.x, trail.y, trail.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  platforms.forEach(segment => segment.draw(ctx));
  collectibles.forEach(collectible => collectible.draw(ctx));
  powerUps.forEach(powerUp => powerUp.draw(ctx));
  hazards.forEach(hazard => hazard.draw(ctx));
  particles.forEach(particle => particle.draw(ctx));
  player.draw(ctx);
  floatingTexts.forEach(fx => fx.draw(ctx));
  ctx.restore();

  if (crashFlash > 0) {
    ctx.save();
    ctx.globalAlpha = crashFlash * 0.8;
    ctx.fillStyle = '#ff1e3c';
    ctx.fillRect(0, 0, config.width, config.height);
    ctx.restore();
  }

  if (state.crashTriggered) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 0, 0, 0.4)';
    ctx.fillRect(0, 0, config.width, config.height);
    ctx.restore();
  }
}

function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function startGame() {
  resetGame();
  hideMessage();
  state.running = true;
  state.gameOver = false;
  state.crashTriggered = false;
}

function handleResize() {
  const container = canvas.parentElement;
  if (!container) {
    return;
  }

  const availableWidth = container.clientWidth || window.innerWidth;
  const availableHeight = container.clientHeight || window.innerHeight;
  const ratio = config.width / config.height;

  let renderWidth = availableWidth;
  let renderHeight = renderWidth / ratio;

  if (renderHeight > availableHeight) {
    renderHeight = availableHeight;
    renderWidth = renderHeight * ratio;
  }

  canvas.style.width = `${renderWidth}px`;
  canvas.style.height = `${renderHeight}px`;
}

// Character selection
characterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const character = btn.dataset.character;
    state.selectedCharacter = character;

    // Update UI
    characterBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    // Hide character select, show welcome screen
    setTimeout(() => {
      characterSelect.classList.remove('visible');
      messagePanel.classList.add('visible');
    }, 300);
  });
});

startButton.addEventListener('click', () => {
  startGame();
});

recoverButton.addEventListener('click', () => {
  if (!state.inBigShort || state.crashTriggered) {
    return;
  }
  bigShortOverlay.classList.remove('visible');
  reinforceGroundUnderPlayer();
  player.y = platformLevels[0] - player.height;
  player.vy = 0;
  player.prevBottom = player.y + player.height;
  player.isGrounded = true;
  for (let i = hazards.length - 1; i >= 0; i -= 1) {
    if (hazards[i].x < player.x + 220) {
      hazards.splice(i, 1);
    }
  }
  state.inBigShort = false;
  state.spawnTimers.sinkhole = 6 + Math.random() * 4;
  updateHud();
  if (state.health <= 0 || state.cdoBank <= 0) {
    triggerCrash(state.health <= 0 ? 'confidence' : 'liquidity');
    return;
  }
  state.running = true;
});

window.addEventListener('keydown', event => {
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    if (!state.running) {
      if (!state.crashTriggered) {
        startGame();
      }
      return;
    }
    player.jump();
    player.jumpHoldTime = config.jumpHoldDuration;
  }
  if (event.code === 'KeyR' && state.crashTriggered) {
    startGame();
  }
});

window.addEventListener('keyup', event => {
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    player.jumpHoldTime = 0;
  }
});

window.addEventListener('resize', handleResize);
handleResize();
initializePlatforms();

function gameLoop(timestamp) {
  const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.035);
  lastTimestamp = timestamp;

  if (state.running && !state.gameOver) {
    updateGame(delta);
  }

  drawGame(delta);
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
updateHud();
