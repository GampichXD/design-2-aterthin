/* ui-animations.js 
   Helper untuk mengupdate visual gauge CSS berdasarkan nilai sensor 
   Dipanggil dari dalam fungsi updateTelemetryUI di main.js 
*/

function updateSensorVisuals(data) {
    if (!data) return;

    // 1. Roll (-45 to 45 degree mapping visual)
    if (data.roll != null) {
        const deg = (data.roll * 180 / Math.PI);
        // Map visual: 0deg is center. 
        const el = document.querySelector('#gauge-roll .bar');
        if(el) el.style.transform = `rotate(${deg}deg)`;
    }

    // 2. Pitch
    if (data.pitch != null) {
        const deg = (data.pitch * 180 / Math.PI);
        const el = document.querySelector('#gauge-pitch .bar');
        if(el) el.style.transform = `rotate(${deg}deg)`;
    }

    // 3. Yaw (0-360)
    if (data.yaw != null) {
        const deg = (data.yaw * 180 / Math.PI);
        const el = document.querySelector('#gauge-yaw .arrow');
        if(el) el.style.transform = `translateX(-50%) rotate(${deg}deg)`;
    }

    // 4. Heading (0-360)
    if (data.heading != null) {
        const deg = parseFloat(data.heading);
        const el = document.querySelector('#gauge-heading .needle');
        // Anggap needle default menunjuk utara (0)
        // CSS untuk needle bisa menggunakan rotate
        if(el) el.style.transform = `translateX(-50%) rotate(${deg}deg)`;
    }

    // 5. Speed (SOG) - Misal max 20 km/h
    if (data.groundspeed != null) {
        const speed = data.groundspeed * 3.6; // m/s to km/h
        const maxSpeed = 20; 
        const pct = Math.min((speed / maxSpeed) * 100, 100);
        const el = document.querySelector('#gauge-speed .speed-bar');
        // Conic gradient trick
        // Kita ubah derajat gradient. 180deg = full (karena setengah lingkaran)
        const angle = (pct / 100) * 180; 
        if(el) el.style.background = `conic-gradient(from 270deg, var(--pink) 0deg, var(--pink) ${angle}deg, transparent ${angle}deg)`;
    }

    // 6. Voltage (LiPo 3S: 11.1V - 12.6V, atau sesuaikan)
    if (data.voltage != null) {
        const v = data.voltage;
        const minV = 10.0;
        const maxV = 13.0;
        let pct = ((v - minV) / (maxV - minV)) * 100;
        pct = Math.max(0, Math.min(100, pct));
        
        const el = document.getElementById('gauge-voltage');
        if (el) {
            el.style.width = `${pct}%`;
            if(pct < 20) el.style.background = 'red';
            else if(pct < 50) el.style.background = 'orange';
            else el.style.background = 'lime';
        }
    }

    // 7. COG
    if (data.cog !== undefined || data.nuc_signal !== undefined) {
        // Nuc Signal dipapping ke COG di main.js lama
        // Pastikan variabel cogValue di main.js di-pass ke sini atau ambil dari DOM
        const val = parseFloat(document.getElementById('signal-value').innerText) || 0;
        const el = document.querySelector('#gauge-cog .arrow');
        if(el) el.style.transform = `translateX(-50%) rotate(${val}deg)`;
    }
}

// Logic seleksi tombol Sensor (Hover/Click)
const cards = document.querySelectorAll('.sensor-card');
cards.forEach(card => {
    card.addEventListener('click', () => {
        // Hapus active dari semua
        cards.forEach(c => c.classList.remove('active'));
        // Tambah ke yang diklik
        card.classList.add('active');
        
        // Update Chart JS Variable di main.js (activeSensor)
        // Kita ubah global variable window.activeSensor jika main.js mengizinkan
        // Atau trigger event
        const sensorKey = card.getAttribute('data-sensor');
        if(typeof window.activeSensor !== 'undefined') {
            window.activeSensor = sensorKey;
            // Force chart update if chart object exists
            if(window.sensorChart) window.sensorChart.update();
        }
    });
});