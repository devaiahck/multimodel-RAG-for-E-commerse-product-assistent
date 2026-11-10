"""
UrbanPick — Realistic Multi-Category Demo Catalog Generator.

NOTE: All prices, price histories, store links, and product entries in this
generated dataset are SIMULATED DEMO DATA for development and testing.
They are NOT live market prices.

Generates 700 products across 7 top-level categories (100 products each):
  1. Clothing
  2. Shoes
  3. Watches
  4. Electronics
  5. Home
  6. Beauty
  7. Sports

All products pass ProductIngestSchema validation.
"""

import hashlib
import json
import os
import random
import re
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional


TOP_CATEGORIES = [
    "Clothing",
    "Shoes",
    "Watches",
    "Electronics",
    "Home",
    "Beauty",
    "Sports",
]

# Stores allowed per category.
# Rule: Myntra and Nykaa only for clothing, shoes, and beauty.
CATEGORY_STORES = {
    "Clothing": ["Amazon", "Flipkart", "Myntra", "Meesho"],
    "Shoes": ["Amazon", "Flipkart", "Myntra", "Meesho"],
    "Watches": ["Amazon", "Flipkart", "Myntra", "Croma"],
    "Electronics": ["Amazon", "Flipkart", "Croma"],
    "Home": ["Amazon", "Flipkart", "Meesho", "Croma"],
    "Beauty": ["Nykaa", "Amazon", "Flipkart", "Myntra"],
    "Sports": ["Amazon", "Flipkart", "Meesho"],
}

# Sub-type templates per category:
# (subtype_name, brands, base_price_range, spec_templates, title_templates)
CATALOG_DEFINITIONS = {
    "Clothing": [
        (
            "T-Shirts",
            ["Levi's", "H&M", "U.S. Polo Assn.", "Wrogn", "Roadster", "Jack & Jones"],
            (499, 1499),
            [
                "100% combed cotton jersey fabric with crew neckline, bio-washed finish and regular fit.",
                "Breathable cotton blend graphic tee with reinforced ribbed collar and soft-touch feel.",
                "Solid slim-fit lightweight cotton t-shirt with short sleeves and double-stitched hem.",
            ],
            [
                "{brand} Classic Crew Neck Cotton T-Shirt",
                "{brand} Graphic Print Regular Fit T-Shirt",
                "{brand} Slim Fit Solid Bio-Wash T-Shirt",
                "{brand} Premium Pima Cotton Round Neck Tee",
            ],
            15,
        ),
        (
            "Shirts",
            ["Allen Solly", "Peter England", "Levi's", "Raymond", "Tommy Hilfiger", "Fabindia"],
            (999, 2999),
            [
                "Pure breathable cotton formal shirt with spread collar, curved hem and patch pocket.",
                "Casual button-down check shirt made from pre-washed textured cotton with single-cuff sleeves.",
                "Linen blend mandarin collar solid shirt tailored for all-day comfort and breathability.",
            ],
            [
                "{brand} Men Slim Fit Solid Formal Shirt",
                "{brand} Casual Button-Down Checked Cotton Shirt",
                "{brand} Mandarin Collar Breathable Linen Shirt",
                "{brand} Regular Fit Pure Cotton Casual Shirt",
            ],
            15,
        ),
        (
            "Jeans",
            ["Levi's", "Spykar", "Mufti", "Roadster", "Jack & Jones", "Pepe Jeans"],
            (1299, 3999),
            [
                "Stretchable denim with classic 5-pocket styling, mid-rise waist and durable zip fly.",
                "Tapered fit dark-wash jeans engineered with elastane blend for flexible everyday wear.",
                "Straight leg vintage washed denim featuring heavy-duty belt loops and copper rivets.",
            ],
            [
                "{brand} 511 Slim Fit Stretchable Denim Jeans",
                "{brand} Mid Rise Clean Look Tapered Jeans",
                "{brand} Regular Fit Light Wash Casual Jeans",
                "{brand} Skinny Fit Dark Blue Denim Jeans",
            ],
            15,
        ),
        (
            "Kurtas",
            ["Fabindia", "Manyavar", "Peter England", "Wrogn", "House of Pataudi"],
            (899, 2999),
            [
                "Handcrafted pure cotton knee-length kurta with side slits, mandarin collar and button placket.",
                "Textured jacquard festive ethnic kurta with long sleeves, straight silhouette and side pockets.",
                "Lightweight blended silk occasion kurta featuring subtle embroidered detailing on the neckline.",
            ],
            [
                "{brand} Handloom Cotton Straight Knee-Length Kurta",
                "{brand} Bandhgala Collar Textured Festive Kurta",
                "{brand} Casual Linen Blend Solid Summer Kurta",
                "{brand} Embroidered Silk Blend Occasion Kurta",
            ],
            15,
        ),
        (
            "Hoodies",
            ["H&M", "Levi's", "Puma", "Wrogn", "Roadster", "Jack & Jones"],
            (1199, 3499),
            [
                "Heavyweight fleece-lined pullover hoodie with kangaroo pouch pocket and drawstring hood.",
                "Zip-through French terry cotton hoodie featuring ribbed cuffs, hem and relaxed silhouette.",
                "Brushed cotton blend warm sweatshirt with adjustable hood and soft inner fleece lining.",
            ],
            [
                "{brand} Relaxed Fit Cotton Blend Pullover Hoodie",
                "{brand} Full-Zip Fleece Lined Warm Winter Hoodie",
                "{brand} Essential Graphic Print Streetwear Hoodie",
                "{brand} Colorblock Brushed Cotton Sweatshirt Hoodie",
            ],
            15,
        ),
        (
            "Joggers",
            ["Puma", "H&M", "Roadster", "Wrogn", "Levi's", "Under Armour"],
            (799, 2499),
            [
                "Tapered cuffed joggers with elasticated drawstring waistband, zippered utility pockets and stretch.",
                "Cotton-rich casual track pants featuring deep side pockets and soft interior loopback fabric.",
                "Athletic slim-fit training joggers engineered for flexible mobility and moisture-wicking comfort.",
            ],
            [
                "{brand} Slim Fit Cotton Elasticated Joggers",
                "{brand} Athletic Training Track Pants with Pockets",
                "{brand} Streetwear Cargo Joggers with Utility Pockets",
                "{brand} Essential Soft Fleece Lounge Joggers",
            ],
            15,
        ),
        (
            "Jackets",
            ["Levi's", "Puma", "H&M", "Roadster", "Woodland", "Tommy Hilfiger"],
            (1999, 5999),
            [
                "Quilted windproof lightweight bomber jacket with water-resistant shell and snap collar.",
                "Rugged denim trucker jacket featuring metal shank buttons, chest flap pockets and waist adjusters.",
                "Insulated winter puffer jacket with stand collar, zippered closure and warm thermal filling.",
            ],
            [
                "{brand} Classic Denim Trucker Jacket",
                "{brand} Lightweight Water-Resistant Bomber Jacket",
                "{brand} Thermal Insulated Winter Puffer Jacket",
                "{brand} Sporty Track Jacket with Zip Pockets",
            ],
            10,
        ),
    ],
    "Shoes": [
        (
            "Running Shoes",
            ["Nike", "Puma", "Adidas", "Asics", "Reebok", "Campus"],
            (1499, 8999),
            [
                "Breathable engineered mesh upper with responsive EVA midsole cushioning and rubber traction outsole.",
                "Lightweight marathon running shoes with high-rebound foam, padded heel collar and TPU stability shank.",
                "Air-cushioned road running shoes featuring reinforced toe cap, flex grooves and anti-slip grip.",
            ],
            [
                "{brand} Air Cushion Breathable Running Shoes",
                "{brand} SpeedFoam Lightweight Daily Running Shoes",
                "{brand} Gel-Responsive Cushion Road Running Shoes",
                "{brand} Nitro Foam Performance Track & Running Shoes",
            ],
            15,
        ),
        (
            "Sneakers",
            ["Puma", "Adidas", "Nike", "Red Tape", "Skechers", "Bata"],
            (1299, 6999),
            [
                "Low-top retro lifestyle sneakers with premium synthetic leather upper and vulcanized rubber sole.",
                "Chunky street-style lace-up sneakers featuring cushioned insole and perforated vamp for breathability.",
                "Minimalist court sneakers with tonal stitching, soft textile lining and shock-absorbing midsole.",
            ],
            [
                "{brand} Smash Leather Low-Top Casual Sneakers",
                "{brand} Retro Court Classic Streetwear Sneakers",
                "{brand} Chunky Sole Cushion Walk Lifestyle Sneakers",
                "{brand} Perforated Lightweight Lace-Up Sneakers",
            ],
            15,
        ),
        (
            "Formal Shoes",
            ["Bata", "Red Tape", "Clarks", "Woodland", "Hush Puppies", "Metro"],
            (1499, 5999),
            [
                "Genuine leather derby formal shoes with high-density foam footbed and slip-resistant PU outsole.",
                "Handcrafted classic leather oxfords featuring cap toe design, waxed laces and cushioned arch support.",
                "Formal lace-up dress shoes built with breathable leather lining and durable stacked heel.",
            ],
            [
                "{brand} Genuine Leather Derby Formal Shoes",
                "{brand} Classic Cap-Toe Oxford Leather Shoes",
                "{brand} Sleek Slip-On Leather Formal Shoes",
                "{brand} Cushioned Sole Business Dress Shoes",
            ],
            15,
        ),
        (
            "Sandals",
            ["Bata", "Woodland", "Sparx", "Red Tape", "Puma", "Campus"],
            (699, 3299),
            [
                "Ergonomic sport sandals with adjustable velcro straps, molded footbed and rugged grooved outsole.",
                "Durable outdoor adventure sandals built with water-resistant webbing straps and textured traction.",
                "Comfort casual leather slide sandals featuring shock-absorbing sole and soft contoured footbed.",
            ],
            [
                "{brand} Outdoor Adventure Strappy Sport Sandals",
                "{brand} Rugged Trekking Multi-Strap Sandals",
                "{brand} Everyday Comfort Adjustable Velcro Sandals",
                "{brand} Soft Cushion EVA Sole Casual Slides",
            ],
            15,
        ),
        (
            "Loafers",
            ["Red Tape", "Bata", "Clarks", "Woodland", "Metro", "Skechers"],
            (1199, 4999),
            [
                "Penny loafer crafted in soft faux-suede leather with flexible TPR driving sole and padded insole.",
                "Moccasin-toe slip-on leather loafers with breathable lining and anti-fatigue arch support.",
                "Textured tassel loafers tailored with flexible rubber grip sole for smart casual occasions.",
            ],
            [
                "{brand} Classic Suede Penny Driving Loafers",
                "{brand} Slip-On Leather Moccasin Loafers",
                "{brand} Textured Smart Casual Tassel Loafers",
                "{brand} Lightweight Comfort Memory Foam Loafers",
            ],
            15,
        ),
        (
            "Walking Shoes",
            ["Skechers", "Puma", "Reebok", "Campus", "Asics", "Bata"],
            (999, 4499),
            [
                "Memory foam cushioned slip-on walking shoes with stretchable mesh knit upper and shock absorbing midsole.",
                "Ultra-lightweight walking footwear featuring arch fit technology and high-abrasion rubber pods.",
                "Breathable sock-fit walking shoes engineered with seamless upper construction and flexible traction.",
            ],
            [
                "{brand} GoWalk Memory Foam Walking Shoes",
                "{brand} Ultra-Lite Slip-On Mesh Walking Shoes",
                "{brand} Arch Comfort Cushion Step Walking Shoes",
                "{brand} Seamless Knit Breathable Daily Walk Shoes",
            ],
            15,
        ),
        (
            "Training Shoes",
            ["Nike", "Adidas", "Puma", "Reebok", "Under Armour"],
            (1999, 7499),
            [
                "Cross-training gym shoes with flat stable base, lateral wrap-up support and high-density foam.",
                "High-intensity workout training shoes built with abrasion-resistant mesh upper and durable grip.",
                "Weightlifting and HIIT multi-functional gym shoes with reinforced midfoot cage and cushioned heel.",
            ],
            [
                "{brand} Cross-Trainer Stable Gym Workout Shoes",
                "{brand} HIIT Training High-Impact Support Shoes",
                "{brand} Multi-Sport Performance Fitness Shoes",
                "{brand} Flex Stability Gym & Weightlifting Shoes",
            ],
            10,
        ),
    ],
    "Watches": [
        (
            "Analog Watches",
            ["Titan", "Fastrack", "Casio", "Timex", "Sonata", "Fossil"],
            (999, 6999),
            [
                "Classic stainless steel analog watch with sunray dial, date display window and 50m water resistance.",
                "Genuine leather strap quartz analog watch with Roman numeral hour markers and mineral crystal glass.",
                "Sleek brass case analog timepiece with luminescent hands, textured dial and deployant clasp.",
            ],
            [
                "{brand} Classic Sunray Dial Analog Watch with Date",
                "{brand} Heritage Leather Strap Quartz Analog Watch",
                "{brand} Stainless Steel Mesh Band Analog Watch",
                "{brand} Slim Contemporary Blue Dial Analog Watch",
            ],
            20,
        ),
        (
            "Chronograph Watches",
            ["Fossil", "Titan", "Casio", "Timex", "Tommy Hilfiger", "Citizen"],
            (2999, 14999),
            [
                "Multi-function chronograph watch with 3 sub-dials, stopwatch function, tachymeter and 100m water resistance.",
                "Rugged stainless steel chronograph timepiece featuring quartz movement, date window and mineral crystal.",
                "Sport luxury chronograph watch with genuine leather strap, luminescent indexes and 24-hour display.",
            ],
            [
                "{brand} Tachymeter Multi-Dial Chronograph Watch",
                "{brand} Heavy Stainless Steel Chronograph Timepiece",
                "{brand} Sport Leather Strap 3-Subdial Chronograph",
                "{brand} Pilot Series Black Ion-Plated Chronograph",
            ],
            20,
        ),
        (
            "Automatic Watches",
            ["Titan", "Casio", "Fossil", "Timex", "Citizen", "Seiko"],
            (6999, 24999),
            [
                "Self-winding automatic mechanical movement with skeleton dial, exhibition case back and 40-hour power reserve.",
                "Premium automatic dress watch with 21-jewel self-winding movement, sapphire glass and leather strap.",
                "Stainless steel automatic diver-style watch with rotating bezel, luminous markers and screw-down crown.",
            ],
            [
                "{brand} Open Heart Skeleton Dial Automatic Watch",
                "{brand} Mechanical Exhibition Caseback Automatic Watch",
                "{brand} Heritage 21-Jewel Self-Winding Dress Watch",
                "{brand} Pro Diver Stainless Steel Automatic Watch",
            ],
            15,
        ),
        (
            "Digital Watches",
            ["Casio", "Fastrack", "Timex", "Sonata"],
            (699, 3999),
            [
                "Retro vintage digital watch with LED backlight, daily alarm, 1/100s stopwatch and stainless steel band.",
                "Shock-resistant rugged digital watch featuring world time, countdown timer, auto calendar and 200m water resistance.",
                "Sport digital timepiece with large high-contrast display, dual time zones and flexible resin strap.",
            ],
            [
                "{brand} Vintage Digital Gold/Silver Tone Watch",
                "{brand} Heavy-Duty Shock Resistant Sport Digital Watch",
                "{brand} Multi-Alarm Waterproof Outdoor Digital Watch",
                "{brand} Slim Resin Band Everyday Digital Watch",
            ],
            15,
        ),
        (
            "Minimalist Watches",
            ["Titan", "Daniel Wellington", "Fastrack", "Timex", "Fossil"],
            (1499, 8999),
            [
                "Ultra-slim 6mm profile minimalist watch with clean indices, scratch-resistant sapphire glass and mesh strap.",
                "Scandinavian inspired minimalist quartz watch with monochromatic dial and vegetable-tanned leather strap.",
                "Sleek unibody round dial watch with minimalist two-hand movement and interchangeable quick-release strap.",
            ],
            [
                "{brand} Ultra-Thin Profile Minimalist Mesh Watch",
                "{brand} Monochromatic Dial Clean Quartz Watch",
                "{brand} Slimline Leather Strap Scandinavian Watch",
                "{brand} Two-Hand Pure Aesthetic Minimalist Timepiece",
            ],
            15,
        ),
        (
            "Sports Watches",
            ["Fastrack", "Casio", "Timex", "Sonata", "Fossil"],
            (899, 4999),
            [
                "Rugged military outdoor sport watch with analog-digital dual display, compass ring and 100m water resistance.",
                "Lightweight sport watch with polyurethane strap, lap counter, countdown timer and vibrant LED backlight.",
                "Tough tactical sports watch with mineral glass, hourly chime, shock protection and durable resin bezel.",
            ],
            [
                "{brand} Ana-Digi Tough Outdoor Sport Watch",
                "{brand} Military Tactical Dual Display Sport Watch",
                "{brand} Lightweight Runner Sport Watch with Lap Timer",
                "{brand} Water-Resistant Camouflage Bezel Sport Watch",
            ],
            15,
        ),
    ],
    "Electronics": [
        (
            "Headphones",
            ["Sony", "boAt", "JBL", "Sennheiser", "Philips", "Boult"],
            (999, 19999),
            [
                "Active Noise Cancelling over-ear wireless headphones with 40mm drivers, 50-hour battery and quick charge.",
                "Foldable Bluetooth over-ear headphones with deep bass response, padded headband and built-in hands-free mic.",
                "High-resolution wireless over-ear headset with LDAC codec support, ambient sound mode and multipoint pairing.",
            ],
            [
                "{brand} ANC Wireless Over-Ear Headphones with 50H Playtime",
                "{brand} Pure Bass Foldable Bluetooth Headphones",
                "{brand} Hi-Res Audio Studio Over-Ear Headphones",
                "{brand} Wireless Noise Cancelling Headset with Mic",
            ],
            15,
        ),
        (
            "Earbuds",
            ["boAt", "Noise", "OnePlus", "Sony", "Boult", "JBL", "Apple", "Samsung"],
            (899, 14999),
            [
                "True wireless in-ear earbuds with active noise cancellation, low-latency gaming mode and 32-hour total playtime.",
                "In-ear TWS earbuds featuring quad-mic ENC for crystal-clear calls, IPX5 water resistance and touch controls.",
                "Ergonomic wireless earbuds with 11mm dynamic drivers, spatial audio support and fast wireless charging case.",
            ],
            [
                "{brand} TWS Earbuds with Active Noise Cancellation",
                "{brand} Quad-Mic ENC True Wireless In-Ear Earbuds",
                "{brand} Spatial Audio Wireless Earbuds with Wireless Case",
                "{brand} Ultra-Low Latency Gaming TWS Earbuds",
            ],
            15,
        ),
        (
            "Smartwatches",
            ["Noise", "boAt", "Fire-Boltt", "Fastrack", "Amazfit", "OnePlus", "Samsung"],
            (1499, 12999),
            [
                "1.43-inch AMOLED display smartwatch with Bluetooth calling, continuous heart rate and SpO2 health tracking.",
                "Rugged outdoor fitness smartwatch with built-in GPS, 100+ sports modes, 10-day battery life and 5ATM water rating.",
                "Curved metal dial smartwatch featuring always-on display, sleep stage analysis and customizable watch faces.",
            ],
            [
                "{brand} AMOLED Display Bluetooth Calling Smartwatch",
                "{brand} Built-in GPS Rugged Fitness Outdoor Smartwatch",
                "{brand} Curved Metal Bezel Health Tracking Smartwatch",
                "{brand} Ultra-Slim HD Display Smartwatch with SpO2",
            ],
            15,
        ),
        (
            "Power Banks",
            ["Mi", "Anker", "Portronics", "Ambrane", "realme", "Philips"],
            (699, 2999),
            [
                "10000mAh compact fast-charging power bank with 22.5W Power Delivery, dual USB-A and USB-C output ports.",
                "20000mAh heavy-duty power bank with 30W bi-directional fast charging, metallic casing and 12-layer circuit protection.",
                "Pocket-sized ultra-slim external battery pack with LED power indicator and multi-device simultaneous charging.",
            ],
            [
                "{brand} 10000mAh 22.5W Two-Way Fast Charging Power Bank",
                "{brand} 20000mAh 30W Power Delivery Multi-Port Power Bank",
                "{brand} Pocket Slim 10000mAh External Battery Pack",
                "{brand} Fast Charge Portable Power Bank with LED Display",
            ],
            15,
        ),
        (
            "Bluetooth Speakers",
            ["boAt", "JBL", "Sony", "Portronics", "Zebronics", "Philips"],
            (799, 9999),
            [
                "Portable waterproof Bluetooth speaker with 16W stereo sound, passive bass radiator and 12-hour battery life.",
                "Rugged IPX7 outdoor wireless speaker with RGB party lights, TWS pairing for stereo mode and punchy bass.",
                "Compact cylindrical pocket speaker featuring Bluetooth 5.3, built-in speakerphone mic and rugged lanyard cord.",
            ],
            [
                "{brand} Portable Waterproof Bluetooth Speaker with Bass",
                "{brand} 20W Rugged IPX7 Outdoor Wireless Speaker",
                "{brand} Pocket Size Mini Bluetooth Speaker with Mic",
                "{brand} RGB Light Show Portable Stereo Bluetooth Speaker",
            ],
            15,
        ),
        (
            "Keyboards",
            ["Logitech", "Zebronics", "Portronics", "Razer", "Redragon", "HP"],
            (799, 7999),
            [
                "Compact mechanical gaming keyboard with hot-swappable tactile blue switches and per-key RGB backlighting.",
                "Wireless multi-device membrane keyboard with quiet scissor keys, Bluetooth/2.4GHz receiver and phone cradle.",
                "Ergonomic full-size computer keyboard with cushioned palm rest, multimedia shortcut keys and spill resistance.",
            ],
            [
                "{brand} Hot-Swappable Mechanical Gaming Keyboard RGB",
                "{brand} Multi-Device Silent Wireless Bluetooth Keyboard",
                "{brand} Ergonomic Full-Size Keyboard with Palm Rest",
                "{brand} Tenkeyless Compact Mechanical Keyboard",
            ],
            15,
        ),
        (
            "Gaming Mice",
            ["Logitech", "Razer", "Zebronics", "Redragon", "Corsair"],
            (499, 4999),
            [
                "Lightweight ergonomic gaming mouse with 16000 DPI optical sensor, 6 programmable buttons and PTFE glide feet.",
                "Wireless high-precision gaming mouse featuring ultra-fast 1ms response rate and customizable RGB lighting.",
                "Ambidextrous gaming mouse with durable mechanical micro-switches rated for 50 million clicks.",
            ],
            [
                "{brand} High Precision 16000 DPI Optical Gaming Mouse",
                "{brand} Ultra-Lightweight Honeycomb Shell RGB Mouse",
                "{brand} Wireless 1ms Low Latency Ergonomic Gaming Mouse",
                "{brand} 6-Button Programmable RGB USB Gaming Mouse",
            ],
            10,
        ),
    ],
    "Home": [
        (
            "Cookware",
            ["Prestige", "Hawkins", "Pigeon", "Wonderchef", "Milton", "Borosil"],
            (799, 4999),
            [
                "Tri-ply stainless steel 3-piece cookware set with stay-cool riveted handles and induction compatible base.",
                "Granite-finish non-stick kadai with toughened glass lid, heavy gauge aluminum body and PFOA-free coating.",
                "Hard anodized pressure cooker with safety valve, ergonomic handles and uniform heat distribution.",
            ],
            [
                "{brand} Tri-Ply Stainless Steel Cookware Set with Lids",
                "{brand} Granite Finish 5-Layer Non-Stick Kadai with Glass Lid",
                "{brand} Hard Anodized 3L Pressure Cooker Induction Base",
                "{brand} Die-Cast Aluminum Dosa Tawa & Fry Pan Combo",
            ],
            15,
        ),
        (
            "Bedsheets",
            ["Bombay Dyeing", "Portico New York", "Solimo", "Trident", "Spaces"],
            (599, 2999),
            [
                "100% pure combed cotton 300 thread count double bedsheet with two matching envelope pillow covers.",
                "Soft breathable cotton sateen king-size bedsheet featuring vibrant floral print and colorfast dye.",
                "Hypoallergenic all-season cotton fitted bedsheet with 360-degree all-around elastic border.",
            ],
            [
                "{brand} 300 TC Pure Cotton Double Bedsheet with 2 Pillow Covers",
                "{brand} Glace Cotton King Size Floral Printed Bedsheet",
                "{brand} Sateen Weave Solid Pastel Cotton Bedspread",
                "{brand} Elastic Fitted Cotton Bedsheet for Double Mattress",
            ],
            15,
        ),
        (
            "Air Fryers",
            ["Philips", "Prestige", "Havells", "Inalsa", "Bajaj", "Kent"],
            (2999, 9999),
            [
                "4.2L digital air fryer with rapid air circulation technology, 8 preset touch cooking modes and 90% less oil.",
                "Large capacity 6L viewing window air fryer with non-stick dishwasher-safe basket and 360-degree heating.",
                "Compact manual air fryer with adjustable temperature control (80-200C) and auto shut-off 30-min timer.",
            ],
            [
                "{brand} Digital Air Fryer 4.2L with Rapid Air Technology",
                "{brand} Large 6L Touch Screen Air Fryer with Viewing Window",
                "{brand} Compact 3.8L Healthy Cooking Oil-Free Air Fryer",
                "{brand} Multi-Function Digital Air Fryer & Roaster Oven",
            ],
            15,
        ),
        (
            "Mixer Grinders",
            ["Philips", "Prestige", "Bajaj", "Preethi", "Sujata", "Havells"],
            (1499, 6999),
            [
                "750W heavy-duty copper motor mixer grinder with 3 stainless steel jars and flow breaker technology.",
                "500W compact kitchen mixer grinder with sharp multi-utility stainless steel blades and overload protector.",
                "1000W professional food processor mixer grinder featuring juice extractor jar and variable speed pulse control.",
            ],
            [
                "{brand} 750W Copper Motor Mixer Grinder with 3 Jars",
                "{brand} 500W Compact Kitchen Mixer Grinder 3-Speed",
                "{brand} 900W Commercial Heavy Duty Dry & Wet Grinder",
                "{brand} Multi-Utility Mixer Grinder with Juicer Attachment",
            ],
            15,
        ),
        (
            "Vacuum Cleaners",
            ["Eureka Forbes", "Philips", "Dyson", "Inalsa", "Agaro", "Kent"],
            (1999, 14999),
            [
                "Handheld cordless stick vacuum cleaner with 150W cyclonic suction, HEPA filtration and motorized brush head.",
                "2-in-1 wet and dry bagless vacuum cleaner with high-efficiency motor, reusable cloth filter and multi-nozzles.",
                "Compact portable car and home vacuum cleaner with 6000Pa suction power and washable filter cup.",
            ],
            [
                "{brand} 2-in-1 Cordless Stick Vacuum Cleaner with HEPA Filter",
                "{brand} Wet and Dry Multi-Surface Canister Vacuum Cleaner",
                "{brand} Handheld High-Suction Portable Home Vacuum",
                "{brand} Cyclonic Bagless Compact Vacuum Cleaner with Attachments",
            ],
            10,
        ),
        (
            "Storage Containers",
            ["Milton", "Cello", "Borosil", "Tupperware", "Signoraware"],
            (399, 1999),
            [
                "Set of 6 airtight borosilicate glass food storage containers with snap-lock leakproof silicone lids.",
                "BPA-free plastic pantry organizer container set with modular stackable design and measuring scoop.",
                "Stainless steel airtight kitchen canister jar set with transparent acrylic see-through lids.",
            ],
            [
                "{brand} Borosilicate Glass Airtight Food Containers Set of 4",
                "{brand} Modular BPA-Free Stackable Kitchen Storage Jars Set of 6",
                "{brand} Stainless Steel Airtight Kitchen Container Canister Set",
                "{brand} Leak-Proof Meal Prep Glass Tiffin Container Set",
            ],
            15,
        ),
        (
            "Electric Kettles",
            ["Prestige", "Pigeon", "Havells", "Bajaj", "Kent", "Milton"],
            (599, 2499),
            [
                "1.5L stainless steel electric kettle with 1500W rapid boil element, auto shut-off and boil-dry protection.",
                "1.8L borosilicate glass electric kettle with blue LED illumination, 360-degree swivel cordless base.",
                "Double-wall cool touch electric water kettle with inner seamless stainless steel tank.",
            ],
            [
                "{brand} 1.5L Stainless Steel Rapid Boil Electric Kettle",
                "{brand} 1.8L Illuminated Glass Electric Kettle Cordless",
                "{brand} Cool-Touch Double Wall Electric Kettle 1.2L",
                "{brand} Multi-Cook Travel Electric Kettle with Boil-Dry Cutoff",
            ],
            15,
        ),
    ],
    "Beauty": [
        (
            "Moisturizers",
            ["Nivea", "Minimalist", "Dot & Key", "Plum", "Cetaphil", "Neutrogena", "Mamaearth"],
            (299, 1299),
            [
                "Hydrating gel moisturizer enriched with ceramides, hyaluronic acid and vitamin B5 for all skin types.",
                "Oil-free lightweight face moisturizer providing 48-hour deep barrier hydration without greasiness.",
                "Nourishing winter cold cream formulated with shea butter, vitamin E and skin-loving botanical extracts.",
            ],
            [
                "{brand} Ceramide & Hyaluronic Acid Daily Barrier Cream",
                "{brand} Oil-Free Ultralight Gel Moisturizer for Face",
                "{brand} Vitamin E Deep Nourishing Skin Cream",
                "{brand} 72-Hour Water Surge Hydrating Face Gel",
            ],
            15,
        ),
        (
            "Sunscreens",
            ["Minimalist", "Dot & Key", "Neutrogena", "Plum", "Derma Co", "Aqualogica"],
            (349, 999),
            [
                "Broad spectrum SPF 50 PA++++ lightweight sunscreen with zero white cast and sweat-resistant formula.",
                "Ultra-matte dewy sunscreen infused with niacinamide and zinc oxide for broad UVA/UVB photostable protection.",
                "Water gel sunscreen enriched with watermelon and hyaluronic acid for glowing, non-sticky sun defense.",
            ],
            [
                "{brand} SPF 50 PA++++ Broad Spectrum Dewy Sunscreen",
                "{brand} Ultra-Matte Dry-Touch Sunblock SPF 50+",
                "{brand} Water Gel Hybrid Sunscreen with Niacinamide",
                "{brand} Invisible Shield Daily Sunscreen Fluid SPF 50",
            ],
            15,
        ),
        (
            "Face Serums",
            ["Minimalist", "Plum", "The Ordinary", "Dot & Key", "L'Oreal Paris", "Derma Co"],
            (399, 1499),
            [
                "10% Niacinamide + 1% Zinc face serum for reducing blemishes, excess sebum and evening skin texture.",
                "2% Salicylic Acid BHA exfoliating serum targeting active acne, blackheads and enlarged pores.",
                "15% Vitamin C glow serum with ferulic acid to brighten dark spots and protect against oxidants.",
            ],
            [
                "{brand} 10% Niacinamide + Zinc Blemish Treatment Serum",
                "{brand} 2% Hyaluronic Acid Deep Hydration Face Serum",
                "{brand} 15% Vitamin C Glow Brightening Face Serum",
                "{brand} 2% Salicylic Acid Pore Minimizing BHA Serum",
            ],
            15,
        ),
        (
            "Shampoos",
            ["L'Oreal Paris", "Mamaearth", "WOW Skin Science", "Biotique", "Tresemme", "Plum"],
            (249, 899),
            [
                "Sulfate-free keratin repair shampoo with argan oil that gently cleanses and strengthens damaged hair strands.",
                "Anti-dandruff tea tree shampoo with ginger oil that soothes itchy scalp and controls flaking naturally.",
                "Biotin and collagen volumizing shampoo designed to add fullness, body and shine to fine hair.",
            ],
            [
                "{brand} Keratin Smooth Repair Moisture Shampoo",
                "{brand} Tea Tree & Ginger Anti-Dandruff Clarifying Shampoo",
                "{brand} Biotin & Collagen Hair Fall Control Shampoo",
                "{brand} Apple Cider Vinegar Restorative Hair Shampoo",
            ],
            15,
        ),
        (
            "Perfumes",
            ["Bella Vita", "Fogg", "Denver", "Fastrack", "Engage", "The Man Company", "Titan"],
            (499, 2999),
            [
                "Long-lasting Eau de Parfum with top citrus notes, woody cedar heart and sensual amber base notes.",
                "Aquatic fresh aromatic perfume for everyday office and casual wear with 8-hour projection.",
                "Warm spicy oriental luxury fragrance crafted with rich oud, vanilla and smoky tonka bean.",
            ],
            [
                "{brand} Luxury Eau De Parfum Long-Lasting Fragrance 100ml",
                "{brand} Fresh Oceanic Eau De Toilette Daily Cologne",
                "{brand} Smokey Oud & Amber Intense Evening Perfume",
                "{brand} Citrus & Woody Cedar Fresh Daily Body Mist",
            ],
            15,
        ),
        (
            "Face Wash",
            ["Himalaya", "Cetaphil", "Mamaearth", "Minimalist", "Dot & Key", "Neutrogena"],
            (149, 699),
            [
                "Gentle purifying neem and salicylic acid foaming cleanser that removes dirt, impurities and excess oil.",
                "Soap-free non-comedogenic hydrating daily facial cleanser formulated for sensitive and dry skin.",
                "Brightening vitamin C foaming face wash with soft built-in silicone brush applicator.",
            ],
            [
                "{brand} Purifying Neem & Green Tea Foaming Face Wash",
                "{brand} Gentle Hydrating Daily Skin Cleanser",
                "{brand} Vitamin C Glowing Face Cleanser with Brush",
                "{brand} Salicylic Acid Deep Pore Cleansing Face Wash",
            ],
            15,
        ),
        (
            "Lipsticks",
            ["Maybelline", "Lakme", "Sugar Cosmetics", "Faces Canada", "Nykaa", "L'Oreal Paris"],
            (299, 1199),
            [
                "Transfer-proof 16-hour liquid matte lipstick with intense color payoff, precision applicator and zero smudging.",
                "Velvet matte bullet lipstick enriched with argan oil and vitamin E for comfortable non-drying wear.",
                "Creamy moisturizing sheer tint lipstick providing all-day hydration with a luminous satin finish.",
            ],
            [
                "{brand} SuperStay 16H Non-Transfer Liquid Matte Lipstick",
                "{brand} Velvet Touch Moisture Rich Bullet Matte Lipstick",
                "{brand} Weightless Mousse Matte Long-Wear Lip Color",
                "{brand} Creamy Satin Hydrating Glossy Lipstick",
            ],
            10,
        ),
    ],
    "Sports": [
        (
            "Yoga Mats",
            ["Boldfit", "Strauss", "Decathlon", "Solimo", "Vector X", "Cockatoo"],
            (499, 1999),
            [
                "6mm thick eco-friendly TPE non-slip yoga mat with alignment lines, carry strap and joint cushioning.",
                "Anti-tear high-density EVA exercise mat providing dual-sided textured grip for Pilates and floor fitness.",
                "Extra-wide premium anti-skid gym fitness mat with moisture-resistant closed-cell surface.",
            ],
            [
                "{brand} 6mm Anti-Skid Eco TPE Dual-Color Yoga Mat",
                "{brand} High-Density Cushioning Floor Exercise Gym Mat",
                "{brand} Anti-Tear Body Alignment Guide Yoga Mat with Strap",
                "{brand} Extra Thick 8mm Workout Mat for Home Fitness",
            ],
            15,
        ),
        (
            "Dumbbells",
            ["Boldfit", "Strauss", "Decathlon", "Cockatoo", "Kobo", "Kore"],
            (599, 3999),
            [
                "Pair of hexagonal PVC coated dumbbells with steel bar core and anti-roll flat edge profile.",
                "Neoprene coated non-slip hand weights set designed for home strength training and aerobic conditioning.",
                "Rubber encased cast iron commercial hex dumbbells with knurled ergonomic chrome grip handle.",
            ],
            [
                "{brand} Hexagonal Anti-Roll Rubber Coated Dumbbells Pair",
                "{brand} Neoprene Coated Non-Slip Hand Weights Set",
                "{brand} Adjustable Weight Dumbbell Bar Set with Spinlock",
                "{brand} Solid Cast Iron Home Fitness Dumbbells Pair",
            ],
            15,
        ),
        (
            "Badminton Rackets",
            ["Yonex", "Li-Ning", "Cosco", "Decathlon", "Vector X"],
            (799, 4999),
            [
                "Full graphite unibody lightweight badminton racket with isometric head frame and 24-lbs string tension.",
                "Aluminum alloy durable recreational badminton racquet featuring built-in T-joint and comfortable PU grip.",
                "Head-heavy smash badminton racket designed for aggressive attacking play and aerodynamic swing speed.",
            ],
            [
                "{brand} Full Carbon Graphite Isometric Badminton Racket",
                "{brand} Aero-Speed Attack Head-Heavy Badminton Racquet",
                "{brand} Durable Aluminum Alloy Dual Badminton Racket Set",
                "{brand} Nanotech High-Tension Lightweight Badminton Racket",
            ],
            15,
        ),
        (
            "Cricket Bats",
            ["SG", "SS", "DSC", "Kookaburra", "Spartan"],
            (999, 8999),
            [
                "Popular willow full-size cricket bat with thick power edges, curved blade and multi-piece cane handle.",
                "Handcrafted Kashmir willow cricket bat featuring large sweet spot, toe protector and chevron rubber grip.",
                "Lightweight tournament grade training cricket bat balanced for quick pick-up and stroke play.",
            ],
            [
                "{brand} Kashmir Willow Short Handle Cricket Bat",
                "{brand} Power-Drive Thick Edge Popular Willow Bat",
                "{brand} Club Master Balanced Stroke Cricket Bat",
                "{brand} Heavy-Hit Tournament Grade Cricket Bat with Cover",
            ],
            15,
        ),
        (
            "Footballs",
            ["Nivia", "Cosco", "Vector X", "Puma", "Adidas", "Decathlon"],
            (399, 2499),
            [
                "Size 5 FIFA basic certified match football with 32 hand-stitched PU panels and reinforced butyl bladder.",
                "Thermal bonded all-weather training football offering true flight trajectory, high abrasion resistance and bounce.",
                "Durable multi-surface street football featuring tough rubberized outer cover and water-resistant finish.",
            ],
            [
                "{brand} Storm 32-Panel Hand Stitched Size 5 Football",
                "{brand} All-Weather Thermal Bonded Training Football",
                "{brand} Tough Rubberized Hard-Ground Outdoor Football",
                "{brand} Pro Match High-Bounce Synthetic Leather Football",
            ],
            15,
        ),
        (
            "Resistance Bands",
            ["Boldfit", "Strauss", "Decathlon", "Slovic", "Cockatoo"],
            (299, 1499),
            [
                "Set of 5 natural latex loop resistance bands with varying tension levels from extra-light to extra-heavy.",
                "Fabric non-slip booty exercise resistance bands for glute activation, yoga and physical therapy.",
                "Heavy-duty pull-up assist power resistance band engineered with 100% layered snap-resistant latex.",
            ],
            [
                "{brand} Loop Resistance Exercise Bands Set of 5 Levels",
                "{brand} Fabric Non-Slip Glute Workout Resistance Bands Set",
                "{brand} Pull-Up Assist Heavy Duty Latex Power Band",
                "{brand} Tube Resistance Bands Set with Door Anchor & Handles",
            ],
            15,
        ),
        (
            "Gym Shakers",
            ["Boldfit", "Strauss", "Decathlon", "Spider", "Vector X"],
            (199, 899),
            [
                "700ml leak-proof protein shaker bottle with stainless steel wire whisk ball and leakproof flip cap.",
                "Compartment shaker bottle with pill tray, protein powder storage box and embossed measurement markings.",
                "BPA-free motivational water and gym shaker bottle with silicone carry loop and anti-slip ribbed grip.",
            ],
            [
                "{brand} 700ml Leak-Proof Protein Shaker with Whisk Ball",
                "{brand} Multi-Storage Compartment Gym Shaker Bottle",
                "{brand} BPA-Free Blender Shaker Cup with Carry Loop",
                "{brand} Dual-Chamber Pre & Post Workout Shaker Bottle",
            ],
            10,
        ),
    ],
}


def make_store_url(store: str, brand: str, title: str) -> str:
    """
    Generate realistic store search URLs that always resolve.

    PLACEHOLDER NOTICE:
    These search URLs are placeholders built from brand and title to ensure
    valid, working links during demo development. They will be replaced by
    direct product page URLs when real ingestion pipelines (e.g. n8n) start.
    """
    query = f"{brand} {title}"
    encoded = urllib.parse.quote_plus(query)
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", query).strip("-").lower()

    if store == "Amazon":
        return f"https://www.amazon.in/s?k={encoded}"
    elif store == "Flipkart":
        return f"https://www.flipkart.com/search?q={encoded}"
    elif store == "Myntra":
        return f"https://www.myntra.com/{slug}"
    elif store == "Meesho":
        return f"https://www.meesho.com/search?q={encoded}"
    elif store == "Croma":
        return f"https://www.croma.com/searchB?q={encoded}%3Arelevance"
    elif store == "Nykaa":
        return f"https://www.nykaa.com/search/result/?q={encoded}"
    else:
        return f"https://www.google.com/search?q={encoded}"


def generate_price_history(
    product_id: str,
    current_price: float,
    pattern: int,
    today: datetime.date,
) -> List[Dict[str, Any]]:
    """
    Generate deterministic price history ending today.

    Patterns:
      1: Steady decline ending near the lowest ("Great time to buy")
      2: Flat with noise ("Fair price")
      3: Spike then drop (sale) ("Great time to buy" / "Good price")
      4: Currently at peak ("Consider waiting")
      5: Currently just above the average ("Consider waiting" / "Fair price")
      6: Too short on purpose (2-4 points, tests "Not enough price history yet")
    """
    rng = random.Random(f"{product_id}-price-history")

    if pattern == 6:
        # 2 to 4 points spaced across the past 30-90 days, ending today at current_price
        num_points = rng.randint(2, 4)
        history = []
        days_back = [rng.randint(60, 90), rng.randint(30, 59), rng.randint(10, 29)]
        days_back = sorted(days_back[: num_points - 1], reverse=True)

        for d in days_back:
            p = round(current_price * rng.uniform(0.95, 1.15), 2)
            history.append({"date": (today - timedelta(days=d)).isoformat(), "price": p})
        history.append({"date": today.isoformat(), "price": float(current_price)})
        return history

    # Patterns 1-5: 90 to 180 daily points ending today
    num_points = rng.randint(90, 180)
    history = []

    for i in range(num_points):
        d = today - timedelta(days=num_points - 1 - i)
        progress = i / max(1, num_points - 1)  # 0.0 -> 1.0

        if i == num_points - 1:
            price = current_price
        elif pattern == 1:
            # Steady decline from ~1.30x down to current_price
            factor = 1.30 - 0.30 * progress + rng.uniform(-0.02, 0.02)
            price = max(current_price, round(current_price * factor, 2))
        elif pattern == 2:
            # Flat with small +/- 2.5% noise
            factor = 1.0 + rng.uniform(-0.025, 0.025)
            price = round(current_price * factor, 2)
        elif pattern == 3:
            # Spike then drop: normal around 1.15x-1.25x, spikes at 80%-90%, then drops to current_price
            if progress < 0.80:
                factor = 1.20 + rng.uniform(-0.04, 0.04)
            elif progress < 0.90:
                factor = 1.35 + rng.uniform(0.00, 0.08)  # spike before sale
            else:
                factor = 1.02 + 0.15 * (1.0 - progress) / 0.10  # sharp drop
            price = max(current_price, round(current_price * factor, 2))
        elif pattern == 4:
            # Currently at peak: was lower (0.75x to 0.85x), trending up to current_price
            factor = 0.78 + 0.22 * progress + rng.uniform(-0.02, 0.02)
            price = min(current_price, round(current_price * factor, 2))
        elif pattern == 5:
            # Currently just above average: average is ~0.92x current_price, current is 8% above average
            factor = 0.92 + rng.uniform(-0.04, 0.04)
            price = round(current_price * factor, 2)
        else:
            price = current_price

        history.append({"date": d.isoformat(), "price": float(price)})

    return history


def generate_catalog() -> List[Dict[str, Any]]:
    """Generate all 700 products deterministically."""
    today = datetime.now(timezone.utc).date()
    products: List[Dict[str, Any]] = []
    seen_ids = set()

    # Load image_map.json if it exists
    data_dir = os.path.dirname(os.path.abspath(__file__))
    image_map_path = os.path.join(data_dir, "image_map.json")
    image_map: Dict[str, List[Dict[str, str]]] = {}
    if os.path.exists(image_map_path):
        try:
            with open(image_map_path, "r", encoding="utf-8") as f:
                image_map = json.load(f)
            print(f"Loaded image map with {len(image_map)} sub-types.")
        except Exception as e:
            print(f"Warning: could not load image_map.json: {e}")

    for top_cat in TOP_CATEGORIES:
        subtypes = CATALOG_DEFINITIONS[top_cat]
        cat_stores = CATEGORY_STORES[top_cat]
        cat_count = 0

        for subtype_name, brands, price_range, spec_templates, title_templates, target_count in subtypes:
            for item_idx in range(target_count):
                # Deterministic seed based on category, subtype, and index
                seed_str = f"{top_cat}:{subtype_name}:{item_idx}"
                rng = random.Random(seed_str)

                brand = brands[item_idx % len(brands)]
                title_template = title_templates[item_idx % len(title_templates)]
                title = title_template.format(brand=brand)
                if item_idx >= len(title_templates):
                    title = f"{title} Series {item_idx + 1}"

                # Base nominal price
                base_min, base_max = price_range
                nominal_price = rng.randint(base_min, base_max)
                # Round to nice Indian e-comm price ending in 99, 49, 90, or 00
                nominal_price = round(nominal_price / 50) * 50 - 1
                if nominal_price < base_min:
                    nominal_price = base_min

                # Choose 2 or 3 stores
                num_stores = rng.choice([2, 3])
                selected_stores = rng.sample(cat_stores, min(num_stores, len(cat_stores)))

                # Generate store prices varying -6% to +8% around nominal price
                raw_store_prices = []
                for s in selected_stores:
                    var = rng.uniform(-0.06, 0.08)
                    store_p = round(nominal_price * (1.0 + var) / 10) * 10
                    # Avoid 0 or negative
                    store_p = max(99.0, float(store_p))
                    raw_store_prices.append((s, store_p))

                # current_price MUST equal lowest store price
                lowest_price = min(p for _, p in raw_store_prices)
                current_price = float(lowest_price)

                # Find store offering current_price
                primary_store = next(s for s, p in raw_store_prices if p == current_price)

                store_availability = []
                for s, p in raw_store_prices:
                    store_url = make_store_url(s, brand, title)
                    store_availability.append({
                        "store": s,
                        "price": float(p),
                        "url": store_url,
                    })

                # Original price (higher for ~70% of products)
                has_discount = (rng.random() < 0.70)
                if has_discount:
                    markup = rng.uniform(1.15, 1.55)
                    original_price = float(round((current_price * markup) / 50) * 50)
                    if original_price <= current_price:
                        original_price = current_price + 200.0
                    discount = round(((original_price - current_price) / original_price) * 100, 1)
                else:
                    original_price = current_price
                    discount = 0.0

                # Specs
                spec_template = spec_templates[item_idx % len(spec_templates)]
                specs = f"{brand} {subtype_name}: {spec_template}"

                # Rating (3.6 to 4.8)
                rating = round(rng.uniform(3.6, 4.8), 1)

                # Unique slug product_id
                slug_base = f"{brand}-{subtype_name}-{item_idx + 1}"
                slug = re.sub(r"[^a-zA-Z0-9]+", "-", slug_base).strip("-").lower()
                # Ensure uniqueness
                unique_slug = slug
                counter = 1
                while unique_slug in seen_ids:
                    unique_slug = f"{slug}-{counter}"
                    counter += 1
                seen_ids.add(unique_slug)

                # Assign price history pattern:
                # ~5% pattern 6 (too short), rest evenly among 1 to 5
                pattern_roll = (hashlib.md5(unique_slug.encode()).digest()[0]) % 100
                if pattern_roll < 5:
                    pattern = 6
                elif pattern_roll < 24:
                    pattern = 1
                elif pattern_roll < 43:
                    pattern = 2
                elif pattern_roll < 62:
                    pattern = 3
                elif pattern_roll < 81:
                    pattern = 4
                else:
                    pattern = 5

                price_history = generate_price_history(unique_slug, current_price, pattern, today)

                category_str = f"{top_cat} / {subtype_name}"

                # Assign image deterministically if available in image_map
                image_url: Optional[str] = None
                image_credit: Optional[Dict[str, str]] = None
                if subtype_name in image_map and image_map[subtype_name]:
                    subtype_photos = image_map[subtype_name]
                    # Stable hash using hashlib MD5
                    hash_val = int(hashlib.md5(unique_slug.encode("utf-8")).hexdigest(), 16)
                    selected_photo = subtype_photos[hash_val % len(subtype_photos)]
                    image_url = selected_photo.get("url")
                    image_credit = {
                        "source": "Pexels",
                        "photographer": selected_photo.get("photographer", "Pexels Contributor"),
                        "photo_page": selected_photo.get("page", "https://www.pexels.com"),
                    }

                product = {
                    "product_id": unique_slug,
                    "title": title,
                    "brand": brand,
                    "category": category_str,
                    "specs": specs,
                    "image_url": image_url,
                    "image_credit": image_credit,
                    "current_price": current_price,
                    "original_price": original_price,
                    "discount": discount,
                    "rating": rating,
                    "availability": "In Stock",
                    "store": primary_store,
                    "store_availability": store_availability,
                    "price_history": price_history,
                }
                products.append(product)
                cat_count += 1

        print(f"Generated {cat_count} products for category: {top_cat}")

    return products


def main():
    print("=" * 60)
    print("Generating UrbanPick Demo Catalog...")
    print("=" * 60)

    products = generate_catalog()
    print(f"\nTotal products generated: {len(products)}")

    # Write to backend/data/demo_catalog.json
    out_dir = os.path.dirname(os.path.abspath(__file__))
    out_file = os.path.join(out_dir, "demo_catalog.json")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(products, f, indent=2, ensure_ascii=False)

    print(f"Saved catalog to: {out_file}")
    print(f"File size: {os.path.getsize(out_file) / 1024:.1f} KB")


if __name__ == "__main__":
    main()

