const Parser = require("rss-parser");
const axios = require("axios");
const cheerio = require("cheerio");

const parser = new Parser();

async function fetchArticles() {
    // Example: Reuters top news RSS
    const feed = await parser.parseURL("https://rss.nytimes.com/services/xml/rss/nyt/World.xml");

    const articles = [];

    for (let item of feed.items) {
        // Fetch full content if RSS summary is short
        let content = item.contentSnippet || "";

        try {
            const res = await axios.get(item.link);
            const $ = cheerio.load(res.data);
            // Example: select main article text
            content = $("article").text().trim() || content;
        } catch (err) {
            console.error("Error fetching article:", item.link);
        }

        articles.push({
            title: item.title,
            content,
            url: item.link,
            publishedAt: item.pubDate
        });

        if (articles.length >= 50) break; // stop at 50 articles
    }

    return articles;
}

fetchArticles().then((articles) => {
    console.log("Fetched articles:", articles.length);
    // Save to JSON
    const fs = require("fs");
    fs.writeFileSync("news_articles.json", JSON.stringify(articles, null, 2));
});
