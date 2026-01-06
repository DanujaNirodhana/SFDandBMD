class App {
    constructor() {
        this.canvas = document.getElementById('sfdCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.supports = []; // Each: { x, type }
        this.loads = [];    // Each: { start, end, startMagnitude, endMagnitude } - UDL/Trapezoidal
        this.pointLoads = []; // Each: { x, magnitude }

        // Default configuration
        this.beamLength = 10;
        this.supports.push({ x: 0, type: 'pin' });
        this.supports.push({ x: 10, type: 'roller' });

        // Example Point Load
        this.pointLoads.push({ x: 5, magnitude: 10 });

        this.initUI();
        this.resizeCanvas();
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.draw();
        });

        // Initial render
        this.calculateAndDraw();
    }

    initUI() {
        // Beam Length
        const beamInput = document.getElementById('beamLength');
        beamInput.value = this.beamLength;
        beamInput.addEventListener('change', (e) => {
            this.beamLength = parseFloat(e.target.value);
            // Update the default right support if it was at previous end
            const rightSup = this.supports.find(s => s.x > this.beamLength || Math.abs(s.x - e.target.defaultValue) < 0.1);
            if (rightSup) rightSup.x = this.beamLength;
            this.renderSupportInputs(); // Re-render to update values
            this.calculateAndDraw();
        });

        // Add Support Button
        document.getElementById('addSupportBtn').addEventListener('click', () => {
            this.supports.push({ x: this.beamLength / 2, type: 'roller' });
            this.renderSupportInputs();
        });

        // Add Point Load Button
        document.getElementById('addPointLoadBtn').addEventListener('click', () => {
            this.pointLoads.push({ x: this.beamLength / 2, magnitude: 10 });
            this.renderPointLoadInputs();
        });

        // Add UDL Load Button
        document.getElementById('addLoadBtn').addEventListener('click', () => {
            this.loads.push({ start: 0, end: this.beamLength / 2, startMagnitude: 10, endMagnitude: 10 });
            this.renderLoadInputs();
        });

        // Generate Button
        document.getElementById('calculateBtn').addEventListener('click', () => this.calculateAndDraw());

        this.renderSupportInputs();
        this.renderPointLoadInputs();
        this.renderLoadInputs();
    }

    renderSupportInputs() {
        const container = document.getElementById('supportsList');
        container.innerHTML = '';
        this.supports.forEach((sup, index) => {
            const div = document.createElement('div');
            div.className = 'dynamic-item';
            div.innerHTML = `
                <input type="number" step="0.1" value="${sup.x}" placeholder="Pos (m)" onchange="app.updateSupport(${index}, 'x', this.value)">
                <button class="icon-btn remove-btn" onclick="app.removeSupport(${index})">×</button>
            `;
            container.appendChild(div);
        });
    }

    renderPointLoadInputs() {
        const container = document.getElementById('pointLoadsList');
        container.innerHTML = '';
        this.pointLoads.forEach((load, index) => {
            const div = document.createElement('div');
            div.className = 'dynamic-item';
            div.innerHTML = `
                <input type="number" step="0.1" value="${load.x}" placeholder="Pos (m)" onchange="app.updatePointLoad(${index}, 'x', this.value)">
                <input type="number" step="1" value="${load.magnitude}" placeholder="kN" onchange="app.updatePointLoad(${index}, 'magnitude', this.value)">
                <button class="icon-btn remove-btn" onclick="app.removePointLoad(${index})">×</button>
            `;
            container.appendChild(div);
        });
    }

    renderLoadInputs() {
        const container = document.getElementById('loadsList');
        container.innerHTML = '';
        this.loads.forEach((load, index) => {
            const div = document.createElement('div');
            div.className = 'dynamic-item';
            div.innerHTML = `
                <input type="number" step="0.1" value="${load.start}" placeholder="Start (m)" onchange="app.updateLoad(${index}, 'start', this.value)">
                <input type="number" step="0.1" value="${load.end}" placeholder="End (m)" onchange="app.updateLoad(${index}, 'end', this.value)">
                <input type="number" step="1" value="${load.startMagnitude}" placeholder="Start kN/m" onchange="app.updateLoad(${index}, 'startMagnitude', this.value)">
                <input type="number" step="1" value="${load.endMagnitude}" placeholder="End kN/m" onchange="app.updateLoad(${index}, 'endMagnitude', this.value)">
                <button class="icon-btn remove-btn" onclick="app.removeLoad(${index})">×</button>
            `;
            container.appendChild(div);
        });
    }

    updateSupport(index, field, value) {
        this.supports[index][field] = parseFloat(value);
        this.calculateAndDraw();
    }

    removeSupport(index) {
        if (this.supports.length <= 1) return;
        this.supports.splice(index, 1);
        this.renderSupportInputs();
        this.calculateAndDraw();
    }

    updatePointLoad(index, field, value) {
        this.pointLoads[index][field] = parseFloat(value);
        this.calculateAndDraw();
    }

    removePointLoad(index) {
        this.pointLoads.splice(index, 1);
        this.renderPointLoadInputs();
        this.calculateAndDraw();
    }

    updateLoad(index, field, value) {
        this.loads[index][field] = parseFloat(value);
        this.calculateAndDraw();
    }

    removeLoad(index) {
        this.loads.splice(index, 1);
        this.renderLoadInputs();
        this.calculateAndDraw();
    }

    resizeCanvas() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight; // 500px min
    }

    calculateReactions() {
        if (this.supports.length !== 2) {
            return { error: "Please ensure exactly 2 supports." };
        }

        const s1 = this.supports[0];
        const s2 = this.supports[1];

        const sortedSupports = [s1, s2].sort((a, b) => a.x - b.x);
        const A = sortedSupports[0];
        const B = sortedSupports[1];

        // Sum Moments about A = 0
        let sumMomentA = 0;
        let totalLoad = 0;

        // UDL/Trapezoidal Moments
        this.loads.forEach(load => {
            const w1 = load.startMagnitude;
            const w2 = load.endMagnitude;
            const L_load = load.end - load.start;

            // Area of trapezoid = (w1 + w2)/2 * L
            const F = ((w1 + w2) / 2) * L_load;

            // Centroid from start of load:
            // For triangle with height h at end: 2L/3
            // For triangle with height h at start: L/3
            // Split trapezoid into rectangle w1 and triangle (w2-w1)
            // Or use formula: x_c = (L/3) * (w1 + 2*w2) / (w1 + w2)
            let centroidDistFromLoadStart;
            if (w1 + w2 === 0) {
                centroidDistFromLoadStart = L_load / 2; // Should not happen for physical loads usually unless zero
            } else {
                centroidDistFromLoadStart = (L_load / 3) * (w1 + 2 * w2) / (w1 + w2);
            }

            const center = load.start + centroidDistFromLoadStart;
            const distA = center - A.x;

            sumMomentA += F * distA;
            totalLoad += F;
        });

        // Point Load Moments
        this.pointLoads.forEach(load => {
            const F = load.magnitude;
            const distA = load.x - A.x;
            sumMomentA += F * distA;
            totalLoad += F;
        });

        const distSup = B.x - A.x;
        if (distSup === 0) return { error: "Supports cannot be at the same location." };

        const Rb = sumMomentA / distSup;
        const Ra = totalLoad - Rb;

        return {
            reactions: [
                { x: A.x, value: Ra, name: 'Ra' },
                { x: B.x, value: Rb, name: 'Rb' }
            ]
        };
    }

    calculateShearForce() {
        const solution = this.calculateReactions();
        if (solution.error) {
            document.getElementById('reactionsOutput').innerText = solution.error;
            return null;
        }

        document.getElementById('reactionsOutput').innerHTML = solution.reactions
            .map(r => `At x=${r.x}m : ${r.value.toFixed(2)} kN`)
            .join('<br>');

        const points = 1000; // Increase resolution
        const data = [];

        for (let i = 0; i <= points; i++) {
            const x = (i / points) * this.beamLength;
            let shear = 0;

            // Reactions (Upward +, Downward -)
            solution.reactions.forEach(r => {
                if (r.x < x || (Math.abs(r.x - x) < 0.0001)) {
                    shear += r.value;
                }
            });

            // Point Loads (Downward +, so subtract)
            this.pointLoads.forEach(load => {
                // Subtract if we passed the load
                if (load.x < x || (Math.abs(load.x - x) < 0.0001)) {
                    shear -= load.magnitude;
                }
            });

            // UDLs / Trapezoidal
            this.loads.forEach(load => {
                const w1 = load.startMagnitude;
                const w2 = load.endMagnitude;

                const start = Math.max(0, load.start);
                const end = Math.min(x, load.end);

                if (end > start) {
                    const fullLen = load.end - load.start;
                    // We need to integrate from load.start to end
                    // But 'end' here is the current x position (capped at load.end)
                    // The integration range is [load.start, end] intersection with [load.start, load.end]
                    // effectively [load.start, x] if x is inside.

                    // Let's call the integration limit x_eff
                    // The integration is from 0 to (x_eff - load.start) relative to load start
                    const x_local = end - load.start;

                    // w(x') = w1 + (w2 - w1) * (x' / fullLen)
                    // Integral w(x') dx' from 0 to x_local
                    // = w1*x_local + (w2-w1)/fullLen * x_local^2 / 2

                    const loadContrib = w1 * x_local + ((w2 - w1) / fullLen) * (x_local * x_local) / 2;

                    shear -= loadContrib;
                }
            });

            data.push({ x, v: shear });
        }
        return data;
    }

    calculateBendingMoment(shearData) {
        if (!shearData || shearData.length === 0) return null;

        const data = [];
        let moment = 0;
        data.push({ x: shearData[0].x, v: 0 });

        for (let i = 1; i < shearData.length; i++) {
            const p1 = shearData[i - 1];
            const p2 = shearData[i];
            const dx = p2.x - p1.x;

            // Trapezoidal rule: Area = (v1 + v2)/2 * dx
            const dArea = ((p1.v + p2.v) / 2) * dx;
            moment += dArea;

            data.push({ x: p2.x, v: moment });
        }
        return data;
    }

    findSpecialPoints(data, type) {
        if (!data || data.length < 2) return [];
        const points = [];

        // 1. End points
        points.push({ x: data[0].x, v: data[0].v, label: 'Start' });
        points.push({ x: data[data.length - 1].x, v: data[data.length - 1].v, label: 'End' });

        // 2. Zero crossings (Intercepts)
        for (let i = 1; i < data.length; i++) {
            const p1 = data[i - 1];
            const p2 = data[i];

            if ((p1.v >= 0 && p2.v < 0) || (p1.v < 0 && p2.v >= 0)) {
                // Linear interpolation for more precise x
                // 0 = v1 + (v2-v1)/(x2-x1) * (x - x1)
                // -v1 = slope * dx_local
                // dx_local = -v1 / slope
                const slope = (p2.v - p1.v) / (p2.x - p1.x);
                if (Math.abs(slope) > 1e-9) {
                    const dx_local = -p1.v / slope;
                    points.push({ x: p1.x + dx_local, v: 0, label: '0' });
                }
            }
        }

        // 3. Local Maxima/Minima (where slope changes sign)
        // For discrete data, check neighbors
        let globalMax = -Infinity;
        let globalMin = Infinity;

        data.forEach(p => {
            if (p.v > globalMax) globalMax = p.v;
            if (p.v < globalMin) globalMin = p.v;
        });

        // Add Global Max/Min
        // Filter to avoid duplicates if they are already endpoints or crossings
        const addIfNotExists = (p, label) => {
            if (!points.some(ex => Math.abs(ex.x - p.x) < 0.01)) {
                points.push({ ...p, label });
            }
        };

        const maxP = data.find(p => p.v === globalMax);
        const minP = data.find(p => p.v === globalMin);

        if (maxP) addIfNotExists(maxP, 'Max');
        if (minP) addIfNotExists(minP, 'Min');

        return points;
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, w, h);

        const shearData = this.calculateShearForce();
        if (!shearData) return;
        const momentData = this.calculateBendingMoment(shearData);

        // Layout Configuration
        const padding = 60;
        const panelH = h / 3; // Section height (Beam, SFD, BMD)

        // 1. Beam Diagram Area (Top)
        const beamY = panelH * 0.5;

        // 2. SFD Area (Middle)
        const sfdZeroY = panelH * 1.5;

        // 3. BMD Area (Bottom)
        const bmdZeroY = panelH * 2.5;

        // Scaling X
        const graphW = w - padding * 2;
        const scaleX = graphW / this.beamLength;
        const screenX = (val) => padding + val * scaleX;

        // Draw Helper Functions
        const drawGrid = (yZero, maxVal, label) => {
            ctx.beginPath();
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(padding, yZero);
            ctx.lineTo(w - padding, yZero);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px Outfit';
            ctx.fillText(label, padding - 40, yZero + 4);
        };

        const drawDiagram = (data, zeroY, colorFillTop, colorFillBot, colorLine) => {
            const maxAbs = Math.max(...data.map(d => Math.abs(d.v)), 1); // Avoid div by 0
            const scaleY = (panelH * 0.4) / (maxAbs * 1.1); // Keep within 40% of panel height
            const screenY = (val) => zeroY - val * scaleY;

            ctx.beginPath();
            ctx.moveTo(screenX(0), zeroY);
            data.forEach(p => ctx.lineTo(screenX(p.x), screenY(p.v)));
            ctx.lineTo(screenX(this.beamLength), zeroY);
            ctx.closePath();

            // Gradient fill
            const grad = ctx.createLinearGradient(0, zeroY - panelH / 2, 0, zeroY + panelH / 2);
            grad.addColorStop(0, colorFillTop);
            grad.addColorStop(0.5, 'rgba(0,0,0,0)'); // Fade near zero? Or just uniform
            // Actually, let's use the colors passed
            // Simpler fill for now to ensure visibility
            ctx.fillStyle = colorFillTop; // Using uniform for simplicity or the gradient passed

            // Better Gradient logic:
            // Positive areas
            ctx.save();
            ctx.clip();
            // We can't easy clip positive/negative separately in one path. 
            // Let's just fill the whole path with a gradient that is green on top, red on bot
            const fillGrad = ctx.createLinearGradient(0, zeroY - panelH / 2, 0, zeroY + panelH / 2);
            fillGrad.addColorStop(0, colorFillTop);
            fillGrad.addColorStop(1, colorFillBot);
            ctx.fillStyle = fillGrad;
            ctx.fill();
            ctx.restore();

            // Outline
            ctx.strokeStyle = colorLine;
            ctx.lineWidth = 2;
            ctx.stroke(); // Re-stroke the data line
        };

        const drawPoints = (points, zeroY, dataMax) => {
            const scaleY = (panelH * 0.4) / (dataMax * 1.1);
            const screenY = (val) => zeroY - val * scaleY;

            points.forEach(p => {
                const sx = screenX(p.x);
                const sy = screenY(p.v);

                ctx.beginPath();
                ctx.arc(sx, sy, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = '#000';
                ctx.stroke();

                // Label
                ctx.fillStyle = '#fff';
                ctx.font = '10px Outfit';
                let labelY = sy - 10;
                if (p.v < 0) labelY = sy + 15;

                const valStr = Math.abs(p.v) < 0.01 ? "0" : p.v.toFixed(2);
                ctx.fillText(`${p.x.toFixed(2)}m, ${valStr}`, sx, labelY);
            });
        };

        // --- DRAW SFD ---
        const maxShear = Math.max(...shearData.map(d => Math.abs(d.v)), 0.1);
        drawGrid(sfdZeroY, maxShear, "SFD (kN)");
        drawDiagram(shearData, sfdZeroY, 'rgba(16, 185, 129, 0.5)', 'rgba(239, 68, 68, 0.5)', '#3b82f6');

        const sfdPoints = this.findSpecialPoints(shearData);
        drawPoints(sfdPoints, sfdZeroY, maxShear);


        // --- DRAW BMD ---
        if (momentData) {
            const maxMoment = Math.max(...momentData.map(d => Math.abs(d.v)), 0.1);
            drawGrid(bmdZeroY, maxMoment, "BMD (kNm)");
            // Invert colors for BMD standard? Or keep same? Let's use Purple/Orange
            drawDiagram(momentData, bmdZeroY, 'rgba(168, 85, 247, 0.5)', 'rgba(249, 115, 22, 0.5)', '#e879f9');

            const bmdPoints = this.findSpecialPoints(momentData);
            drawPoints(bmdPoints, bmdZeroY, maxMoment);
        }

        // --- DRAW PHYSICAL BEAM (Top) ---
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(screenX(0), beamY);
        ctx.lineTo(screenX(this.beamLength), beamY);
        ctx.stroke();

        // Supports
        ctx.fillStyle = '#fbbf24';
        this.supports.forEach(s => {
            const sx = screenX(s.x);
            const sy = beamY;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - 10, sy + 20);
            ctx.lineTo(sx + 10, sy + 20);
            ctx.closePath();
            ctx.fill();
        });

        // Point Loads
        this.pointLoads.forEach(l => {
            const sx = screenX(l.x);
            const sy = beamY;
            const arrowLen = 30;
            ctx.beginPath();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.moveTo(sx, sy - arrowLen);
            ctx.lineTo(sx, sy);
            ctx.moveTo(sx - 5, sy - 10);
            ctx.lineTo(sx, sy);
            ctx.lineTo(sx + 5, sy - 10);
            ctx.stroke();
            ctx.fillStyle = '#ef4444';
            ctx.textAlign = 'center';
            ctx.fillText(`${l.magnitude}kN`, sx, sy - arrowLen - 5);
        });

        // UDLs
        this.loads.forEach(l => {
            // Simplified drawing for space
            const sx1 = screenX(l.start);
            const sx2 = screenX(l.end);
            const sy = beamY;
            const h = 20;

            ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
            ctx.fillRect(sx1, sy - h, sx2 - sx1, h);
            ctx.strokeStyle = '#ef4444';
            ctx.strokeRect(sx1, sy - h, sx2 - sx1, h);

            ctx.fillStyle = '#ef4444';
            ctx.fillText(`${l.startMagnitude}kN/m`, (sx1 + sx2) / 2, sy - h - 5);
        });

    }

    calculateAndDraw() {
        this.draw();
    }
}

const app = new App();
window.app = app;
