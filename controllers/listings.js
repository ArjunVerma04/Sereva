const Listing = require("../models/listings");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));


module.exports.index = async (req, res) => {
  const allListings = await Listing.find({});
  res.render("./listings/index.ejs", {allListings});
};

module.exports.renderNewForm = (req, res) => {
  res.render("./listings/new.ejs");
};

module.exports.showListing = async (req, res) => {
  let {id} = req.params;
  const listing = await Listing.findById(id)
    .populate({
        path: "reviews",
        populate: { 
            path: "author",
        },
     })
    .populate("owner");
    if(!listing) {
     req.flash("error", "Listing you requested for does not exist!");
     res.redirect("/listings");  
    }
    // console.log(listing);
  console.log("Coordinates:", listing.geometry?.coordinates);
  res.render("./listings/show.ejs", {listing});
};

module.exports.createListing = async (req, res) => {
  const { listing } = req.body;

  console.log("📍 City Input:", listing.location);
  console.log("🌐 Country Input (manual):", listing.country);

  let coordinates = [77.2090, 28.6139]; // Default coordinates
  let country = listing.country?.trim(); // Prefer manual input

  try {
    // Step 1: Forward geocode city to coordinates
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(listing.location)}&format=json&limit=1`,
      {
        headers: {
          "User-Agent": "SerevaApp/1.0 (youremail@example.com)"
        }
      }
    );

    const geoData = await geoRes.json();
    console.log("📦 Forward Geocoding Response:", geoData);

    if (geoData.length > 0) {
      coordinates = [
        parseFloat(geoData[0].lon),
        parseFloat(geoData[0].lat),
      ];

      // Step 2: If country was not entered manually, reverse geocode to get it
      if (!country || country === "") {
        const reverseRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${coordinates[1]}&lon=${coordinates[0]}&format=json`,
          {
            headers: {
              "User-Agent": "SerevaApp/1.0 (youremail@example.com)",
              "Accept-Language": "en"
            }
          }
        );

        const reverseData = await reverseRes.json();
        console.log("🌍 Reverse Geocoding Response:", reverseData);

        country = reverseData.address?.country;

        if (!country || /[^\u0000-\u007F]/.test(country)) {
          const displayName = reverseData.display_name;
          const parts = displayName.split(",");
          country = parts[parts.length - 1].trim();
          console.log("🔁 Fallback Country from display_name:", country);
        }
      }
    } else {
      console.warn("⚠️ No geocoding results found for city.");
    }
  } catch (err) {
    console.error("❌ Geocoding failed:", err);
  }

  const newListing = new Listing({
    ...listing,
    country: country || "India", // Use detected or fallback
    geometry: {
      type: "Point",
      coordinates,
    },
    owner: req.user._id,
  });

  if (req.file) {
    newListing.image = {
      url: req.file.path,
      filename: req.file.filename,
    };
  }

  await newListing.save();
  console.log("✅ Final Coordinates:", coordinates);
  console.log("🌍 Country Saved:", country);
  req.flash("success", "Listing created successfully!");
  res.redirect(`/listings/${newListing._id}`);
};



module.exports.renderEditForm =  async (req, res) => {
  let {id} = req.params;
  const listing = await Listing.findById(id);
  if(!listing) {
    req.flash("error", "Listing you requested for does not exist!");
    res.redirect("/listings");  
  }

  let originalImageUrl = listing.image.url;
  originalImageUrl = originalImageUrl.replace("/upload", "/upload/w_250")
  res.render("./listings/edit.ejs", {listing, originalImageUrl });
};

module.exports.updateListing =  async (req, res) => {
  let {id} = req.params;
  let listing = await Listing.findByIdAndUpdate(id, {...req.body.listing});

  if(typeof req.file !== "undefined") {
    let url = req.file.path;
    let filename = req.file.filename;
    listing.image = { url, filename };
    await listing.save();
  }
  req.flash("success", "Listing Updated!");
  res.redirect(`/listings/${id}`);
};

module.exports.destroyListing =  async (req, res) => {
  let {id} = req.params;
  let deletedListing = await Listing.findByIdAndDelete(id);
  console.log(deletedListing);
  req.flash("success", " Listing Deleted!");
  res.redirect("/listings");
};
