/* converter/writer.js */

/**
 * Generate .elmulti file content.
 */

function generateElmulti(zoneData, instrumentName) {
    let output = `# ELEKTRON MULTI-SAMPLE MAPPING FORMAT
version = 0
name = '${instrumentName}'
`;

    // Sort: Pitch -> Velocity
    const zonesByKey = {}; // "pitch-minvel" -> list of zones (RR)

    zoneData.sort((a, b) => {
        if (a.pitch !== b.pitch) return a.pitch - b.pitch;
        return a.minvel - b.minvel;
    });

    // Group by unique Key/Vel combo
    let currentPitch = null;

    for (let i = 0; i < zoneData.length; i++) {
        const zone = zoneData[i];

        // Detect Pitch Change to write header
        if (zone.pitch !== currentPitch) {
            currentPitch = zone.pitch;
            output += `
[[key-zones]]
pitch = ${zone.pitch}
key-center = ${zone.keyCenter}.0
`;
        }

        // Velocity Layer
        // Handle Round Robin: if next zones have same pitch/vel, they are RR variants
        // But wait, the format is [[key-zones.velocity-layers]] then multiple [[sample-slots]].
        // We need to group adjacent zones with same pitch/vel.

        // Check if we already processed this group
        if (i > 0 && zoneData[i - 1].pitch === zone.pitch && zoneData[i - 1].minvel === zone.minvel) {
            continue;
        }

        // Start Velocity Layer
        const velocity = zone.minvel > 0 ? (zone.minvel / 127).toFixed(8) : "0.49411765";
        output += `
[[key-zones.velocity-layers]]
velocity = ${velocity}
strategy = 'Forward'
`;

        // Find all zones that match this pitch/vel (for Round Robin)
        const rrZones = zoneData.filter(z => z.pitch === zone.pitch && z.minvel === zone.minvel);

        // Write Sample Slots
        for (const rrZone of rrZones) {
            output += `
[[key-zones.velocity-layers.sample-slots]]
sample = '${rrZone.newFileName}'
`;
            if (rrZone.loop) {
                output += `loop-mode = 'Forward'
loop-start = ${rrZone.loopStart}
loop-end = ${rrZone.loopEnd}
`;
                if (rrZone.loopCrossfade > 0) {
                    // We don't have sample rate here easily to convert ms to samples
                    // But in the python script it is calculated.
                    // For now, omit or assume standard? 
                    // If we had sample rate we could calculate.
                    // Let's assume 48000 for calculation if needed, or just 0 for browser version MVP.
                }
                output += "keep-looping-on-release = true\n"; // Assume true like Python default
            } else {
                output += "loop-mode = 'Off'\n";
            }
        }
    }

    return output;
}
