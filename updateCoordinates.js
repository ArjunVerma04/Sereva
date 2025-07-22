const mongoose = require("mongoose");
const Listing = require("./models/listings");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Replace with your actual MongoDB connection string
mongoose.connect("mongodb://127.0.0.1:27017/sereva", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  // Find listings with missing or default coordinates
  const listings = await Listing.find({
    $or: [
      { geometry: { $exists: false } },
      { "geometry.coordinates": [0, 0] },
    ],
  });

  for (let listing of listings) {
    if (!listing.location) continue;

    console.log(`🌍 Updating: ${listing.title} (${listing.location})`);

    try {
      // Forward geocode: city → coordinates
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(listing.location)}&format=json&limit=1`,
        {
          headers: {
            "User-Agent": "SerevaApp/1.0 (update-coordinates-script)",
          },
        }
      );

      const geoData = await geoRes.json();

      if (geoData.length > 0) {
        const lat = parseFloat(geoData[0].lat);
        const lon = parseFloat(geoData[0].lon);

        listing.geometry = {
          type: "Point",
          coordinates: [lon, lat],
        };

        // Reverse geocode: coordinates → country (in English)
        const reverseRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
          {
            headers: {
              "User-Agent": "SerevaApp/1.0 (update-coordinates-script)",
              "Accept-Language": "en", // ✅ Force English
            },
          }
        );

        const reverseData = await reverseRes.json();
        let country = reverseData.address?.country;

        // Fallback: if country is in non-English or undefined
        if (!country || /[^\u0000-\u007F]/.test(country)) {
          const displayName = reverseData.display_name;
          const parts = displayName.split(",");
          country = parts[parts.length - 1].trim();
        }

        listing.country = country;

        await listing.save();
        console.log(`✅ Updated: ${listing.title} → ${country}`);
      } else {
        console.warn(`⚠️ No geo results for ${listing.title}`);
      }
    } catch (err) {
      console.error(`❌ Error updating ${listing.title}:`, err);
    }

    await delay(1100); // ⏱ Respect Nominatim rate limit (1 request/second)
  }

  mongoose.connection.close();
})();
