const Parser = require('rss-parser');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = 'UCiTfaOBnvbvkwAopRUIMtgQ';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const ACTIVITY_FILE = path.join(__dirname, '../_data/activity.yml');

(async () => {
    try {
        // 1. Fetch RSS Feed
        const parser = new Parser();
        const feed = await parser.parseURL(RSS_URL);

        console.log(`Fetched ${feed.items.length} videos from RSS.`);

        // 2. Read Existing Activity Data
        let activityData = [];
        try {
            const fileContent = fs.readFileSync(ACTIVITY_FILE, 'utf8');
            activityData = yaml.load(fileContent) || [];
        } catch (e) {
            console.log("No existing activity file found, creating new.");
        }

        // 3. Process New Items
        let newItemsCount = 0;

        // RSS items are usually newest first. We reverse to process oldest-newest 
        // effectively, but actually we just want to check existence.
        // Let's iterate the feed items.
        for (const item of feed.items) {
            const videoUrl = item.link;
            const videoTitle = item.title;
            const videoDate = new Date(item.pubDate).toISOString().split('T')[0];

            // Check if already exists
            const exists = activityData.find(entry => entry.url === videoUrl);

            if (!exists) {
                // Create new entry
                // Use contentSnippet (plain text) or title as fallback. Truncate if too long.
                let desc = item.contentSnippet || `New upload: ${videoTitle}`;
                if (desc.length > 200) {
                    desc = desc.substring(0, 197) + '...';
                }

                const newEntry = {
                    date: videoDate,
                    type: 'Video',
                    title: videoTitle,
                    url: videoUrl,
                    description: desc
                };

                // Add to TOP of list (YAML list)
                activityData.unshift(newEntry);
                newItemsCount++;
                console.log(`Added: ${videoTitle} (${videoDate})`);
            }
        }

        if (newItemsCount > 0) {
            // 4. Save back to YAML
            // Sort by date desc (just to be clean, though Liquid handles it)
            activityData.sort((a, b) => new Date(b.date) - new Date(a.date));

            const yamlStr = yaml.dump(activityData, { lineWidth: -1 });
            fs.writeFileSync(ACTIVITY_FILE, yamlStr, 'utf8');
            console.log(`Updated activity.yml with ${newItemsCount} new videos.`);
        } else {
            console.log("No new videos found.");
        }

    } catch (err) {
        console.error("Error updating feed:", err);
        process.exit(1);
    }
})();
