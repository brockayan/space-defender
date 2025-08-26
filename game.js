(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // UI Elements
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const muteBtn = document.getElementById('muteBtn');
  const overlay = document.getElementById('overlay');

  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const powerupsContainer = document.getElementById('powerupsContainer');

  // Game variables
  let gameState = 'start'; // 'start', 'playing', 'paused', 'gameover'
  let keys = {};

  // Player variables
  const player = {
    x: W / 2 - 25,
    y: H - 80,
    width: 50,
    height: 70,
    speed: 6,
    health: 100,
    maxHealth: 100,
    doubleGun: false,
    shootingCooldown: 0,
    shootingRate: 300, // milliseconds between shots
  };

  // Arrays for bullets, enemies, powerups
  const playerBullets = [];
  const enemyBullets = [];
  const enemies = [];
  const powerups = [];

  // Stars for background
  const stars = [];

  // Stats
  let score = 0;
  let lives = 3;
  let level = 1;
  let enemySpawnTimer = 2000; // ms
  let enemySpawnTimerCurrent = 0;
  let totalTime = 0;

  // Sound (beep) toggle
  let muted = false;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Active powerups durations
  const activePowerups = {};

  // Utility: Clamp
  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  // Utility: Rect collision detection
  function rectsIntersect(r1, r2) {
    return !(
      r2.x > r1.x + r1.width ||
      r2.x + r2.width < r1.x ||
      r2.y > r1.y + r1.height ||
      r2.y + r2.height < r1.y
    );
  }

  // Star background generation
  for (let i = 0; i < 150; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      radius: Math.random() * 1.1 + 0.1,
      speed: Math.random() * 0.3 + 0.1,
      draw() {
        ctx.beginPath();
        ctx.fillStyle = '#0ff';
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 2;
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      },
      update() {
        this.y += this.speed;
        if (this.y > H) {
          this.y = 0;
          this.x = Math.random() * W;
        }
      },
    });
  }

  // Player drawing (spaceship shape)
  function drawPlayer() {
    const x = player.x;
    const y = player.y;
    const w = player.width;
    const h = player.height;

    // Glow effect
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur = 15;

    // Ship body
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w * 0.75, y + h);
    ctx.lineTo(x + w * 0.75, y + h * 0.6);
    ctx.lineTo(x + w * 0.25, y + h * 0.6);
    ctx.lineTo(x + w * 0.25, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = '#0ff';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.3, w * 0.15, h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Draw health bar above player
    const barWidth = w;
    const barHeight = 6;
    const healthRatio = player.health / player.maxHealth;

    ctx.fillStyle = '#222';
    ctx.fillRect(x, y - 12, barWidth, barHeight);
    ctx.fillStyle = healthRatio > 0.5 ? '#0f0' : healthRatio > 0.2 ? '#ff0' : '#f00';
    ctx.fillRect(x, y - 12, barWidth * healthRatio, barHeight);
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - 12, barWidth, barHeight);
  }

  // Bullet class
  class Bullet {
    constructor(x, y, speedY, fromEnemy = false) {
      this.x = x;
      this.y = y;
      this.width = 6;
      this.height = 14;
      this.speedY = speedY;
      this.fromEnemy = fromEnemy;
    }
    update() {
      this.y += this.speedY;
    }
    draw() {
      ctx.fillStyle = this.fromEnemy ? '#f00' : '#0ff';
      ctx.shadowColor = this.fromEnemy ? '#f00' : '#0ff';
      ctx.shadowBlur = 12;
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.shadowBlur = 0;
    }
    offScreen() {
      return this.y < -this.height || this.y > H + this.height;
    }
    rect() {
      return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
  }

  // Enemy class
  class Enemy {
    constructor(level) {
      this.size = 40 + level * 4; // grows with level
      this.x = Math.random() * (W - this.size);
      this.y = -this.size;
      this.speedY = 1 + level * 0.15; // speed up with level
      this.health = 2 + level;
      this.shootCooldown = Math.random() * 3000 + 1000;
      this.shootTimer = 0;
    }
    update(delta) {
      this.y += this.speedY;
      this.shootTimer += delta;
      if (this.shootTimer >= this.shootCooldown) {
        this.shootTimer = 0;
        this.shootCooldown = Math.random() * 3000 + 1000;
        this.shoot();
      }
    }
    draw() {
      // Red triangle spaceship with glow
      ctx.shadowColor = '#f00';
      ctx.shadowBlur = 15;

      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.moveTo(this.x + this.size / 2, this.y);
      ctx.lineTo(this.x + this.size, this.y + this.size);
      ctx.lineTo(this.x, this.y + this.size);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;

      // Health bar
      const barWidth = this.size;
      const barHeight = 6;
      const healthRatio = this.health / (2 + level);
      ctx.fillStyle = '#222';
      ctx.fillRect(this.x, this.y - 10, barWidth, barHeight);
      ctx.fillStyle = healthRatio > 0.5 ? '#0f0' : healthRatio > 0.2 ? '#ff0' : '#f00';
      ctx.fillRect(this.x, this.y - 10, barWidth * healthRatio, barHeight);
      ctx.strokeStyle = '#f00';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x, this.y - 10, barWidth, barHeight);
    }
    shoot() {
      const bulletX = this.x + this.size / 2 - 3;
      const bulletY = this.y + this.size;
      enemyBullets.push(new Bullet(bulletX, bulletY, 5, true));
      playBeep(350, 0.1);
    }
    hit(dmg) {
      this.health -= dmg;
      return this.health <= 0;
    }
    isOffScreen() {
      return this.y > H;
    }
    rect() {
      return { x: this.x, y: this.y, width: this.size, height: this.size };
    }
  }

  // Powerup class
  class Powerup {
    constructor(x, y, type) {
      this.x = x;
      this.y = y;
      this.size = 30;
      this.speedY = 2;
      this.type = type; // 'life' or 'doubleGun'
      this.duration = 10000; // 10 seconds duration for doubleGun
    }
    update() {
      this.y += this.speedY;
    }
    draw() {
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur = 15;
      ctx.fillStyle = this.type === 'life' ? '#0f0' : '#0ff';
      ctx.beginPath();
      ctx.arc(this.x + this.size / 2, this.y + this.size / 2, this.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Icon
      ctx.fillStyle = '#004400';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (this.type === 'life') ctx.fillText('♥', this.x + this.size / 2, this.y + this.size / 2 + 2);
      else if (this.type === 'doubleGun') ctx.fillText('≡', this.x + this.size / 2, this.y + this.size / 2 + 2);
    }
    isOffScreen() {
      return this.y > H;
    }
    rect() {
      return { x: this.x, y: this.y, width: this.size, height: this.size };
    }
  }

  // Play simple beep sound
  function playBeep(frequency = 440, duration = 0.1) {
    if (muted) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  }

  // Player shooting
  function playerShoot() {
    if (player.shootingCooldown > 0) return;
    player.shootingCooldown = player.shootingRate;

    if (player.doubleGun) {
      playerBullets.push(new Bullet(player.x + 8, player.y, -9));
      playerBullets.push(new Bullet(player.x + player.width - 14, player.y, -9));
    } else {
      playerBullets.push(new Bullet(player.x + player.width / 2 - 3, player.y, -9));
    }
    playBeep(900, 0.05);
  }

  // Spawn enemy
  function spawnEnemy() {
    enemies.push(new Enemy(level));
  }

  // Powerup spawn chance on enemy death
  function maybeSpawnPowerup(x, y) {
    const chance = Math.random();
    if (chance < 0.2) {
      const type = Math.random() < 0.5 ? 'life' : 'doubleGun';
      powerups.push(new Powerup(x, y, type));
    }
  }

  // Update powerups display in UI
  function updatePowerupsUI() {
    powerupsContainer.innerHTML = '';
    for (const [key, timeLeft] of Object.entries(activePowerups)) {
      if (timeLeft > 0) {
        const icon = createPowerupIcon(key, `${key === 'doubleGun' ? 'Double Gun' : 'Extra Life'} (expires in ${(timeLeft / 1000).toFixed(1)}s)`);
        powerupsContainer.appendChild(icon);
      }
    }
  }

  // Create powerup icon with tooltip
  function createPowerupIcon(type, tooltip) {
    const div = document.createElement('div');
    div.classList.add('powerup-icon');
    div.tabIndex = 0;

    let svgContent = '';
    if (type === 'life') {
      svgContent = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#0f0" d="M12 21s-6-4.35-10-9.35C-1 6 4-1 12 4c8-5 13 2 10 7.65-4 5-10 9.35-10 9.35z"/>
      </svg>`;
    } else if (type === 'doubleGun') {
      svgContent = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect fill="#0ff" x="4" y="8" width="4" height="8" rx="1" ry="1"/>
        <rect fill="#0ff" x="16" y="8" width="4" height="8" rx="1" ry="1"/>
      </svg>`;
    }
    div.innerHTML = svgContent + `<div class="powerup-tooltip">${tooltip}</div>`;
    return div;
  }

  // Reset game variables
  function resetGame() {
    player.x = W / 2 - player.width / 2;
    player.y = H - 80;
    player.health = player.maxHealth;
    player.doubleGun = false;
    playerBullets.length = 0;
    enemyBullets.length = 0;
    enemies.length = 0;
    powerups.length = 0;
    activePowerups.doubleGun = 0;
    score = 0;
    lives = 3;
    level = 1;
    enemySpawnTimer = 2000;
    enemySpawnTimerCurrent = 0;
    totalTime = 0;
    overlay.classList.remove('visible');
    pauseBtn.disabled = false;
    updateStats();
    updatePowerupsUI();
  }

  // Update stats UI
  function updateStats() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    levelEl.textContent = level;
  }

  // Handle player movement & shooting
  function handleInput(delta) {
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
  player.x -= player.speed * (delta / 16);
}
if (keys['ArrowRight'] || keys['d'] || keys['D']) {
  player.x += player.speed * (delta / 16);
}

    player.x = clamp(player.x, 0, W - player.width);

    if (keys[' '] || keys['ArrowUp']) {
      playerShoot();
    }

    if (player.shootingCooldown > 0) {
      player.shootingCooldown -= delta;
      if (player.shootingCooldown < 0) player.shootingCooldown = 0;
    }
  }

  // Update and draw all game objects
  function updateGame(delta) {
    ctx.clearRect(0, 0, W, H);

    // Draw stars background
    stars.forEach((s) => {
      s.update();
      s.draw();
    });

    // Update and draw player
    drawPlayer();

    // Update player bullets
    for (let i = playerBullets.length - 1; i >= 0; i--) {
      const b = playerBullets[i];
      b.update();
      b.draw();
      if (b.offScreen()) playerBullets.splice(i, 1);
    }

    // Update enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.update();
      b.draw();
      if (b.offScreen()) enemyBullets.splice(i, 1);
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      enemy.update(delta);
      enemy.draw();

      // Check if enemy off screen bottom -> lose life
      if (enemy.isOffScreen()) {
        enemies.splice(i, 1);
        lives--;
        playBeep(150, 0.2);
        if (lives <= 0) gameOver();
      }
    }

    // Update powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.update();
      p.draw();
      if (p.isOffScreen()) powerups.splice(i, 1);
    }

    // Player bullets hit enemies
    for (let bIdx = playerBullets.length - 1; bIdx >= 0; bIdx--) {
      const bullet = playerBullets[bIdx];
      for (let eIdx = enemies.length - 1; eIdx >= 0; eIdx--) {
        const enemy = enemies[eIdx];
        if (rectsIntersect(bullet.rect(), enemy.rect())) {
          playerBullets.splice(bIdx, 1);
          const died = enemy.hit(1);
          if (died) {
            // Enemy died
            score += 10 * level;
            maybeSpawnPowerup(enemy.x + enemy.size / 2, enemy.y + enemy.size / 2);
            enemies.splice(eIdx, 1);
            playBeep(600, 0.12);
          } else {
            playBeep(500, 0.06);
          }
          break;
        }
      }
    }

    // Enemy bullets hit player
    for (let idx = enemyBullets.length - 1; idx >= 0; idx--) {
      const bullet = enemyBullets[idx];
      if (rectsIntersect(bullet.rect(), { x: player.x, y: player.y, width: player.width, height: player.height })) {
        enemyBullets.splice(idx, 1);
        player.health -= 20;
        playBeep(200, 0.15);
        if (player.health <= 0) {
          lives--;
          player.health = player.maxHealth;
          playBeep(150, 0.4);
          if (lives <= 0) gameOver();
        }
      }
    }

    // Player collects powerups
    for (let idx = powerups.length - 1; idx >= 0; idx--) {
      const p = powerups[idx];
      if (rectsIntersect(p.rect(), { x: player.x, y: player.y, width: player.width, height: player.height })) {
        if (p.type === 'life') {
          lives++;
          playBeep(800, 0.25);
        } else if (p.type === 'doubleGun') {
          activePowerups.doubleGun = p.duration;
          player.doubleGun = true;
          playBeep(1200, 0.3);
        }
        powerups.splice(idx, 1);
      }
    }

    // Powerup durations update
    if (activePowerups.doubleGun) {
      activePowerups.doubleGun -= delta;
      if (activePowerups.doubleGun <= 0) {
        activePowerups.doubleGun = 0;
        player.doubleGun = false;
      }
    }

    updatePowerupsUI();

    // Spawn enemies gradually faster, fewer initially, then more & faster with levels
    enemySpawnTimerCurrent += delta;
    if (enemySpawnTimerCurrent > enemySpawnTimer) {
      spawnEnemy();
      enemySpawnTimerCurrent = 0;

      // Decrease spawn time with cap
      if (enemySpawnTimer > 1200) enemySpawnTimer -= 5;
    }

    // Level progression every 30 seconds
    totalTime += delta;
    if (totalTime > 30000) {
      level++;
      totalTime = 0;
      enemySpawnTimer = Math.max(700, enemySpawnTimer - 300);
      playLevelUpEffect();
    }

    updateStats();
  }

  // Level up visual effect
  function playLevelUpEffect() {
    overlay.textContent = `Level ${level} Reached!`;
    overlay.classList.add('visible');
    setTimeout(() => {
      overlay.classList.remove('visible');
    }, 2200);
    playBeep(1200, 0.5);
  }

  // Game over
  function gameOver() {
  gameState = 'gameover';
  overlay.innerHTML = `
    <h2>💀 GAME OVER 💀</h2>
    <p>Final Score: ${score}</p>
    <p>Press <strong>START</strong> to play again</p>
  `;
  overlay.classList.add('visible');
  pauseBtn.disabled = true;
  startBtn.disabled = false;
  startBtn.textContent = "START AGAIN";
}


  // Pause game toggle
  function togglePause() {
    if (gameState === 'playing') {
      gameState = 'paused';
      pauseBtn.textContent = 'RESUME';
      overlay.textContent = 'PAUSED';
      overlay.classList.add('visible');
    } else if (gameState === 'paused') {
      gameState = 'playing';
      pauseBtn.textContent = 'PAUSE';
      overlay.classList.remove('visible');
    }
  }

  // Start game
  function startGame() {
  resetGame();
  gameState = 'playing';
  startBtn.disabled = true;
  startBtn.textContent = "START GAME";   // reset button label
  pauseBtn.disabled = false;
  pauseBtn.textContent = 'PAUSE';
  overlay.classList.remove('visible');
  requestAnimationFrame(gameLoop);
}


  // Event listeners
  startBtn.addEventListener('click', startGame);
  pauseBtn.addEventListener('click', togglePause);
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? '🔇 Muted' : '🔊 Mute';
  });

 window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  // Prevent page scrolling on Space & Arrow keys
  if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
  }

  keys[e.key] = true;


    if ((gameState === 'start' || gameState === 'gameover') && e.key === 'Enter') {
      startGame();
    }
    if (e.key === 'Escape' && (gameState === 'playing' || gameState === 'paused')) {
      togglePause();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  // Game loop
  let lastTime = 0;
  function gameLoop(timestamp = 0) {
  if (!lastTime) lastTime = timestamp;
  let delta = timestamp - lastTime;
  lastTime = timestamp;

  // Cap delta to avoid lag spikes
  if (delta > 40) delta = 40;


    if (gameState === 'playing') {
      handleInput(delta);
      updateGame(delta);
    }

    requestAnimationFrame(gameLoop);
  }

  // Initial UI setup
  overlay.textContent = 'Press START or ENTER to begin';
  overlay.classList.add('visible');
  pauseBtn.disabled = true;
  
})();
