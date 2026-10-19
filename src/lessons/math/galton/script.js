/**
 * Galton Board Simulation
 * Visualizes Normal Distribution using a physics-based simulation.
 */

class Ball {
    constructor(x, y, radius, boardHeight) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 1; // Slight random initial horizontal velocity
        this.vy = 0;
        this.radius = radius;
        this.friction = 0.5; // Energy loss on bounce
        this.gravity = 0.25;
        this.boardHeight = boardHeight;
        this.isFinished = false; // True when settled in a bin
        this.binIndex = -1;
    }

    update() {
        if (this.isFinished) return;

        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;

        // Terminal velocity cap (optional, improves stability)
        if (this.vy > 10) this.vy = 10;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#38bdf8';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.closePath();
    }
}

class GaltonBoard {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Configuration
        this.config = {
            rows: 15,
            pegRadius: 4,
            pegSpacing: 40, // Horizontal spacing
            ballRadius: 4.5,
            spawnRate: 2, // Balls per frame (adjustable)
        };

        this.width = 0;
        this.height = 0;

        // State
        this.balls = [];
        this.pegs = [];
        this.bins = []; // Array of counts
        this.isRunning = false;

        // Stats
        this.stats = {
            total: 0,
            mean: 0,
            stdDev: 0
        };

        this.init();

        // Handle window resize
        window.addEventListener('resize', () => this.resize());
        this.resize(); // Initial setup
    }

    init() {
        const startBtn = document.getElementById('start-btn');
        const resetBtn = document.getElementById('reset-btn');

        startBtn.addEventListener('click', () => {
            this.isRunning = !this.isRunning;
            startBtn.textContent = this.isRunning ? "Pause" : "Resume";
            startBtn.classList.toggle('primary'); // Visual feedback
            startBtn.classList.toggle('secondary');
        });

        resetBtn.addEventListener('click', () => this.reset());

        this.loop();
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        this.setupBoard();
    }

    setupBoard() {
        this.pegs = [];
        // Setup Bins (Counts) - Create one more bin than rows
        if (this.bins.length === 0) {
            this.bins = new Array(this.config.rows + 1).fill(0);
        }

        const startY = 100;

        // Calculate total pyramid width to center it
        // The last row has (rows) pegs. Staggared. 
        // Actually, usually row i has i pegs or similar.
        // Let's do a classic staggered grid.
        // Row 0: 1 peg
        // Row 1: 2 pegs... 
        // Row n: n+1 pegs

        for (let row = 0; row < this.config.rows; row++) {
            const pegsInRow = row + 1;
            const rowWidth = (pegsInRow - 1) * this.config.pegSpacing;
            const startX = (this.width - rowWidth) / 2;

            for (let i = 0; i < pegsInRow; i++) {
                const x = startX + i * this.config.pegSpacing;
                // Vertical spacing approx sqrt(3)/2 * horizontal ideal for triangles, 
                // but we can increase gap for ball clearance.
                const y = startY + row * 40;
                this.pegs.push({ x, y, r: this.config.pegRadius });
            }
        }

        // Store bin zones (bottom area)
        this.binWidth = this.config.pegSpacing;
        this.binY = startY + this.config.rows * 40 + 20;
    }

    reset() {
        this.balls = [];
        this.bins = new Array(this.config.rows + 1).fill(0);
        this.stats = { total: 0, mean: 0, stdDev: 0 };
        this.updateStatsDOM();
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawBoard(); // Redraw static elements immediately
    }

    spawnBall() {
        // Spawn slightly randomized around center top
        const x = this.width / 2 + (Math.random() - 0.5) * 2;
        const y = 20;
        this.balls.push(new Ball(x, y, this.config.ballRadius, this.height));
    }

    resolveCollisions() {
        for (let ball of this.balls) {
            if (ball.isFinished) continue;

            // Peg Collisions
            for (let peg of this.pegs) {
                const dx = ball.x - peg.x;
                const dy = ball.y - peg.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = ball.radius + peg.r;

                if (dist < minDist) {
                    // Collision detected
                    // Simple impulse: push away from peg center
                    const angle = Math.atan2(dy, dx);
                    const force = 0.5; // Bounce strengh

                    // Add some randomness to ensure 50/50 decision at top center hits
                    const noise = (Math.random() - 0.5) * 0.1;

                    ball.vx = Math.cos(angle + noise) * 2;
                    ball.vy = Math.abs(Math.sin(angle + noise) * 2) * 0.5; // Always bounce down/sides slightly

                    // Push out to prevent sticking
                    const overlap = minDist - dist;
                    ball.x += Math.cos(angle) * overlap;
                    ball.y += Math.sin(angle) * overlap;
                }
            }

            // Floor/Bin Collision
            if (ball.y > this.binY - 10) {
                // Lock into bin
                ball.isFinished = true;

                // Determine which bin it fell into
                // Finding relative X from the first peg of the last row would be ideal, 
                // but we can infer from screen center.

                // The center of the board is this.width/2.
                // Each bin is pegSpacing wide.
                // Center bin index is roughly rows/2.

                const centerIndex = this.config.rows / 2;
                const offsetFromCenter = ball.x - (this.width / 2);
                // Round to nearest bin index
                let binIdx = Math.round(centerIndex + offsetFromCenter / this.config.pegSpacing);

                // Clamp
                if (binIdx < 0) binIdx = 0;
                if (binIdx >= this.bins.length) binIdx = this.bins.length - 1;

                this.bins[binIdx]++;
                this.updateStats();

                // Remove ball to save performance, OR keep it static? 
                // For stacks, we usually just draw the count as a bar (histogram)
                // and remove the ball object.

                // Let's remove the ball and draw bars instead for cleaner visuals & performance
                ball.shouldRemove = true;
            }
        }

        // Clean up finished balls
        this.balls = this.balls.filter(b => !b.shouldRemove);
    }

    updateStats() {
        this.stats.total++;

        // Calculate Mean (Expected vs Actual)
        // Bins are 0 to rows. 
        // Value of a bin can be considered its index 0..N
        let sum = 0;
        let weightedSum = 0;

        for (let i = 0; i < this.bins.length; i++) {
            sum += this.bins[i];
            weightedSum += i * this.bins[i];
        }

        if (sum > 0) {
            this.stats.mean = weightedSum / sum;

            let varianceSum = 0;
            for (let i = 0; i < this.bins.length; i++) {
                varianceSum += this.bins[i] * Math.pow(i - this.stats.mean, 2);
            }
            this.stats.stdDev = Math.sqrt(varianceSum / sum);
        }

        // Throttle DOM updates slightly? No, JS is fast enough for this counters
        this.updateStatsDOM();
    }

    updateStatsDOM() {
        document.getElementById('total-count').innerText = this.stats.total;
        document.getElementById('mean-val').innerText = this.stats.mean.toFixed(2);
        document.getElementById('std-dev-val').innerText = this.stats.stdDev.toFixed(2);

        // Update description based on count
        const desc = document.getElementById('distribution-desc');
        if (this.stats.total > 500) {
            desc.innerText = "Conforming to Bell Curve closely.";
            desc.style.color = "#4ade80";
        } else {
            desc.innerText = "Gathering data...";
            desc.style.color = "#94a3b8";
        }
    }

    update() {
        if (!this.isRunning) return;

        // Spawner
        // Spawn multiple balls per frame to fill faster?
        if (Math.random() < 1) { // 100% per frame
            this.spawnBall();
        }

        this.balls.forEach(ball => ball.update());
        this.resolveCollisions();
    }

    drawBoard() {
        // Draw Pegs target positions
        this.ctx.fillStyle = '#64748b';
        for (let peg of this.pegs) {
            this.ctx.beginPath();
            this.ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Draw Bins (Histogram)
        // Determine middle of columns
        // We need to calculate where exactly the bins are visually.
        // It should align with the spaces between the last row of pegs.

        const lastRowY = this.binY - 20; // Approx
        const maxCount = Math.max(...this.bins, 10); // Scale bars

        const centerIndex = this.config.rows / 2;

        for (let i = 0; i < this.bins.length; i++) {
            const count = this.bins[i];
            const height = (count / maxCount) * 200; // 200px max height

            // X position: 
            // The bin corresponds to the gap.
            // i=0 is far left.
            // Center is Width/2.
            const offsetIdx = i - centerIndex;
            const x = (this.width / 2) + (offsetIdx * this.config.pegSpacing);

            const bottomY = this.height - 20;

            // Draw Bar
            this.ctx.fillStyle = `rgba(56, 189, 248, 0.6)`;
            // Glow effect for higher bars
            if (count > maxCount * 0.8) this.ctx.fillStyle = `rgba(56, 189, 248, 0.9)`;

            const barWidth = this.config.pegSpacing - 4;

            this.ctx.fillRect(x - barWidth / 2, bottomY - height, barWidth, height);

            // Draw count text on top if space allows
            if (count > 0) {
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '10px monospace';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(count, x, bottomY - height - 5);
            }
        }

        // Draw Ideal Normal Curve Overlay
        if (this.stats.total > 50 && this.stats.stdDev > 0) {
            this.drawNormalCurve(maxCount, centerIndex, this.config.pegSpacing, this.height - 20);
        }
    }

    drawNormalCurve(maxCount, centerIndex, binWidth, bottomY) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#f472b6'; // Pink color for curve
        this.ctx.lineWidth = 2;

        const mean = this.stats.mean;
        const stdDev = this.stats.stdDev;

        // Scale peak value to match the histogram's max height roughly or mathematically?
        // Let's match the probability density to the histogram scale.
        // Peak of PDF is approx 0.4 / stdDev
        // Total area of histogram = Total Balls * Bin Width (in value units... actually bin width is 1 unit in index space)

        // Let's iterate X in pixels.
        const pixelsPerCount = 200 / maxCount;

        for (let xPixel = 0; xPixel < this.width; xPixel += 5) {
            const xStartBoard = (this.width / 2) - (centerIndex * binWidth);
            const binDomainX = (xPixel - xStartBoard) / binWidth;

            const exponent = -0.5 * Math.pow((binDomainX - mean) / stdDev, 2);
            const yValue = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);

            // Expected count in this bin (approx) = Total * Probability
            const startPredictedCount = yValue * this.stats.total;

            const yPixelHeight = startPredictedCount * pixelsPerCount;

            if (xPixel === 0) this.ctx.moveTo(xPixel, bottomY - yPixelHeight);
            else this.ctx.lineTo(xPixel, bottomY - yPixelHeight);
        }

        this.ctx.stroke();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        this.drawBoard();

        // Draw Balls
        for (let ball of this.balls) {
            ball.draw(this.ctx);
        }
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

// Start app
// Initial wait to ensure DOM loaded? (Already at end of body)
const app = new GaltonBoard('galton-canvas');
