// Conway's Game of Life preview for the project card.
// Draws one static generation when the visitor prefers reduced motion.
(function () {
    const canvas = document.getElementById('life');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const size = 25;
    const cols = Math.floor(canvas.width / size);
    const rows = Math.floor(canvas.height / size);
    let grid = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => Math.random() < 0.22));

    function cellColor() {
        return getComputedStyle(document.documentElement).getPropertyValue('--cell').trim() || '#1a1a1a';
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = cellColor();
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (grid[y][x]) ctx.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
            }
        }
    }

    function step() {
        grid = grid.map((row, y) => row.map((alive, x) => {
            let n = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if ((dx || dy) && grid[(y + dy + rows) % rows][(x + dx + cols) % cols]) n++;
                }
            }
            return n === 3 || (alive && n === 2);
        }));
    }

    draw();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setInterval(() => { step(); draw(); }, 180);
})();
