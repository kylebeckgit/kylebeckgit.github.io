const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const axios = require('axios');

const DATA_FILE = path.join(__dirname, '../_data/tonverk_presets.yml');

// Helper to fetch description
async function fetchDescription(url) {
    try {
        console.log(`Fetching: ${url}`);
        const res = await axios.get(url);
        const html = res.data;

        // Simple regex to find og:description
        // Matches <meta property="og:description" content="..."> or content="..." property="og:description"
        // Gumroad usually has property="og:description" content="..."
        const match = html.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i) ||
            html.match(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']/i);

        if (match && match[1]) {
            let desc = match[1];

            const decode = (str) => {
                return str.replace(/&amp;/g, '&')
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>');
            };

            let prev = "";
            // Decode recursively (max 3 times to be safe)
            for (let i = 0; i < 3; i++) {
                prev = desc;
                desc = decode(desc);
                if (prev === desc) break;
            }

            return desc;
        }
        return "";
    } catch (err) {
        console.error(`Error fetching ${url}:`, err.message);
        return null;
    }
}

async function main() {
    if (!fs.existsSync(DATA_FILE)) {
        console.error(`Data file not found at ${DATA_FILE}`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
    let data;
    try {
        data = yaml.load(fileContent);
    } catch (e) {
        console.error('Error parsing YAML:', e);
        process.exit(1);

    }

    let modified = false;

    for (const category of data) {
        if (category.subcategories) {
            for (const sub of category.subcategories) {
                if (sub.items) {
                    for (const item of sub.items) {
                        if (item.url) {
                            const description = await fetchDescription(item.url);
                            if (description && description !== item.description) {
                                // Decode simple entities if needed, but let's keep raw fetch for now
                                // Gumroad decodes in the meta tag usually?
                                item.description = description;
                                modified = true;
                                console.log(`Updated description for: ${item.name}`);
                            } else if (!description) {
                                console.log(`No description found for: ${item.name}`);
                            }
                        }
                    }
                }
            }
        }
    }

    if (modified) {
        const newYaml = yaml.dump(data, { lineWidth: -1 }); // -1 disables line wrapping
        fs.writeFileSync(DATA_FILE, newYaml, 'utf8');
        console.log('Updated _data/tonverk_presets.yml');
    } else {
        console.log('No changes detected.');
    }
}

main();
