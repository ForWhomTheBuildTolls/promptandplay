const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hudCdo = document.getElementById('hudCdo');
const hudScore = document.getElementById('hudScore');
const hudRisk = document.getElementById('hudRisk');
const hudHealth = document.getElementById('hudHealth');

const messagePanel = document.getElementById('messagePanel');
const startButton = document.getElementById('startButton');
const messageTitle = document.getElementById('messageTitle');
const messageBody = document.getElementById('messageBody');
const bigShortOverlay = document.getElementById('bigShortOverlay');
const recoverButton = document.getElementById('recoverButton');
const config = {
  width: canvas.width,
  height: canvas.height,
  groundHeight: 120,
  baseSpeed: 320,
  maxSpeed: 650,
  gravity: 2400,
  jumpVelocity: -940,
  jumpHoldBoost: -1800,
  jumpHoldDuration: 0.18,
  maxFallSpeed: 1500,
  confidenceDecayBase: 0.65,
  confidenceDecayRamp: 0.45,
  collectibleValue: 3,
  hazardPenalty: 5,
  hazardHealthPenalty: 8,
  healthMax: 100,
  bigShortPenalty: 30,
  bigShortCdoPenalty: 8,
  platformMinWidth: 230,
  platformMaxWidth: 460,
  platformGapMin: 60,
  platformGapMax: 150,
  platformGapChance: 0.22
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
  spawnTimers: {
    collectible: 0.9,
    hazard: 2.4,
    sinkhole: 8
  }
};


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

  reset() {
    this.x = 160;
    this.y = this.groundY();
    this.vy = 0;
    this.isGrounded = true;
    this.jumpHoldTime = 0;
    this.runCycle = 0;
    this.prevBottom = this.y + this.height;
  }

  groundY() {
    return platformLevels[0] - this.height;
  }

  update(delta) {
    this.prevBottom = this.y + this.height;
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
    }
  }

  jump() {
    if (this.isGrounded) {
      this.vy = config.jumpVelocity;
      this.isGrounded = false;
      this.jumpHoldTime = config.jumpHoldDuration;
      spawnDust(this.x + this.width * 0.5, this.y + this.height, 10, '#00fff2');
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

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    const bounce = Math.sin(this.runCycle) * (this.isGrounded ? 4 : 0);
    ctx.translate(0, bounce * 0.6);

    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#09152e';
    ctx.beginPath();
    ctx.ellipse(this.width * 0.45, this.height + 12, 32, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body
    ctx.save();
    ctx.fillStyle = '#1b77ff';
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
    }
    ctx.restore();

    // Face mask
    ctx.save();
    ctx.fillStyle = '#ffe0c4';
    ctx.beginPath();
    ctx.ellipse(this.width * 0.6, this.height * 0.4, 16, 18, 0, 0, Math.PI * 2);
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
    ctx.strokeStyle = '#1b77ff';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    const armSwing = Math.sin(this.runCycle * 1.8) * (this.isGrounded ? 12 : 6);
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
    ctx.strokeStyle = '#123fbd';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    const legSwing = Math.sin(this.runCycle * 1.4) * (this.isGrounded ? 16 : 8);
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
    ctx.fillStyle = '#ff234f';
    const shoeBounce = Math.abs(Math.sin(this.runCycle * 1.4)) * 2;
    ctx.beginPath();
    ctx.ellipse(this.width * 0.45 - legSwing, this.height + 6 + shoeBounce, 18, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(this.width * 0.65 + legSwing, this.height + 6 + shoeBounce, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

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

    const gradient = ctx.createRadialGradient(0, 0, 6, 0, 0, this.radius + 6);
    gradient.addColorStop(0, '#00fff2');
    gradient.addColorStop(0.4, '#00d4ff');
    gradient.addColorStop(1, 'rgba(0, 240, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 4, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();

    ctx.fillStyle = '#06142c';
    ctx.font = '700 16px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CDO', 0, 0);

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
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 220;
    this.vy = -Math.random() * 220;
    this.life = 0.6;
    this.color = color;
  }

  update(delta) {
    this.vy += config.gravity * 0.4 * delta;
    this.x += this.vx * delta;
    this.y += this.vy * delta;
    this.life -= delta;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(this.life / 0.6, 0);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
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
    player.y = landingPlatform.top - player.height;
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
    particles.push(new Particle(x + Math.random() * 8, y + Math.random() * 6, color));
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
  state.cdoBank = 28;
  state.distance = 0;
  state.currentSpeed = config.baseSpeed;
  state.spawnTimers.collectible = 0.45;
  state.spawnTimers.hazard = 1.6;
  state.spawnTimers.sinkhole = 8;
  state.gameOver = false;
  state.crashTriggered = false;
  state.inBigShort = false;
  state.winAchieved = false;
  state.health = config.healthMax;
  collectibles.length = 0;
  hazards.length = 0;
  floatingTexts.length = 0;
  particles.length = 0;
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

  const risk = getRiskLevel();
  hudRisk.textContent = risk.label;
  hudRisk.style.color = risk.color;
  hudCdo.style.color = risk.color;
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
  addFloatingText(`+${collectible.value} CDOs`, collectible.x, collectible.y - 12, '#00f5ff');
  spawnDust(collectible.x, collectible.y, 6, '#00f5ff');
  updateHud();
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
  setTimeout(() => {
    showMessage(
      'Soft Landing',
      `You navigated ${distance} market meters and unwound the bubble without a crash.<br/>Wall Street crowns you the master of risk.`,
      'Run Another Scenario'
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

  if (state.spawnTimers.collectible <= 0) {
    spawnCollectible();
    const difficulty = getDifficultyScale();
    state.spawnTimers.collectible = (0.45 + Math.random() * 0.6) / Math.min(1.4, difficulty);
  }
  if (state.spawnTimers.hazard <= 0) {
    spawnHazard();
    const difficulty = getDifficultyScale();
    state.spawnTimers.hazard = (1.4 + Math.random() * 1.2) / difficulty;
  }
  if (state.spawnTimers.sinkhole <= 0) {
    spawnSinkhole();
    const difficulty = getDifficultyScale();
    state.spawnTimers.sinkhole = (8 + Math.random() * 5) / Math.max(1, difficulty * 0.8);
  }

  const targetSpeed = config.baseSpeed + Math.min(state.distance * 1.6, config.maxSpeed - config.baseSpeed);
  state.currentSpeed += (targetSpeed - state.currentSpeed) * Math.min(1, delta * 0.8);

  player.update(delta);
  resolvePlatformCollisions();

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

  platforms.forEach(segment => segment.draw(ctx));
  collectibles.forEach(collectible => collectible.draw(ctx));
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
