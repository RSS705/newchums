/**
 * Curated word lists for fun auto-generated usernames.
 *
 * Used by generateFunUsername() in api/src/username.ts at lightweight-signup
 * time. Format: <Adjective><Animal><###> (e.g. HappyOtter273).
 *
 * Both lists are pre-vetted for:
 *  - Positive, friendly connotations
 *  - No loaded / sexual / violent / political terms
 *  - Category-safe across global audiences
 *  - Short enough that adj + animal + 3 digits fits under 20 chars
 *
 * Add / remove freely. Each array is the source of truth; no external deps.
 */

export const USERNAME_ADJECTIVES: readonly string[] = [
  "Happy", "Brave", "Witty", "Clever", "Calm", "Cosmic", "Sunny", "Rustic",
  "Swift", "Gentle", "Quiet", "Quirky", "Mellow", "Plucky", "Curious", "Breezy",
  "Cheery", "Dreamy", "Earnest", "Friendly", "Glowing", "Humble", "Jolly",
  "Kindly", "Lucky", "Merry", "Nimble", "Peppy", "Radiant", "Snappy",
  "Spirited", "Thoughtful", "Upbeat", "Vibrant", "Zesty", "Bright", "Bubbly",
  "Daring", "Easygoing", "Fearless", "Gleeful", "Hearty", "Inspired", "Jovial",
  "Keen", "Lively", "Mighty", "Noble", "Optimistic", "Playful", "Quick",
  "Ready", "Steady", "Tidy", "Vivid", "Warm", "Youthful", "Zippy", "Amiable",
  "Balmy", "Chipper", "Dandy", "Earthy", "Festive", "Genuine", "Honest",
  "Inventive", "Jaunty", "Keenest", "Loyal", "Magnetic", "Nifty", "Obliging",
  "Polite", "Quirkiest", "Restful", "Spry", "Thrifty", "Trusty", "Unique",
  "Vocal", "Whimsical", "Agile", "Bold", "Crisp", "Dapper", "Eager", "Fluffy",
  "Gallant", "Hopeful", "Idyllic", "Jazzy", "Kooky", "Lofty", "Modest",
  "Neat", "Outgoing", "Polished", "Rosy", "Serene", "Tender", "Uplifted",
  "Vivacious", "Wise", "Alert", "Beaming", "Cozy", "Dashing", "Elated",
  "Fluffy", "Graceful", "Handy", "Iridescent", "Jumpy", "Kindhearted",
  "Limber", "Majestic", "Neighborly", "Open", "Perky", "Refined", "Sincere",
  "Tactful", "Unassuming", "Valiant", "Wholesome", "Amused", "Blithe",
  "Chatty", "Delightful", "Elegant", "Fond", "Good", "Helpful",
  "Imaginative", "Joyful", "Kindred", "Loving", "Mindful", "Nurturing",
  "Observant", "Patient", "Quaint", "Reliable", "Sparky", "Tidy",
  "Understanding", "Vigilant", "Welcoming",
] as const;

export const USERNAME_ANIMALS: readonly string[] = [
  "Otter", "Badger", "Fox", "Owl", "Finch", "Wolf", "Bear", "Heron", "Hare",
  "Seal", "Robin", "Lynx", "Deer", "Panda", "Koala", "Moose", "Raven",
  "Sparrow", "Squirrel", "Hedgehog", "Quokka", "Beaver", "Wombat", "Lemur",
  "Ocelot", "Puffin", "Turtle", "Toad", "Newt", "Eagle", "Falcon", "Dolphin",
  "Whale", "Narwhal", "Walrus", "Capybara", "Marmot", "Weasel", "Ferret",
  "Stoat", "Mongoose", "Bunny", "Rabbit", "Gopher", "Chipmunk", "Mouse",
  "Vole", "Shrew", "Mole", "Bat", "Raccoon", "Skunk", "Armadillo", "Sloth",
  "Tapir", "Okapi", "Gazelle", "Antelope", "Elk", "Caribou", "Bison",
  "Yak", "Llama", "Alpaca", "Camel", "Donkey", "Pony", "Zebra", "Giraffe",
  "Elephant", "Rhino", "Hippo", "Kangaroo", "Wallaby", "Dingo", "Meerkat",
  "Lemming", "Jerboa", "Pika", "Platypus", "Echidna", "Possum", "Aardvark",
  "Pangolin", "Manatee", "Dugong", "Seahorse", "Starfish", "Urchin", "Crab",
  "Lobster", "Shrimp", "Prawn", "Clam", "Oyster", "Mussel", "Snail", "Slug",
  "Butterfly", "Moth", "Beetle", "Ladybug", "Dragonfly", "Firefly", "Cricket",
  "Grasshopper", "Bee", "Wasp", "Ant", "Termite", "Aphid", "Mantis", "Cicada",
  "Goose", "Duck", "Swan", "Crane", "Flamingo", "Pelican", "Cormorant",
  "Albatross", "Gull", "Tern", "Kingfisher", "Hummingbird", "Parrot", "Parakeet",
  "Cockatoo", "Toucan", "Woodpecker", "Magpie", "Jay", "Crow", "Chickadee",
  "Nuthatch", "Warbler", "Wren", "Swallow", "Swift", "Nightingale", "Thrush",
  "Oriole", "Cardinal", "Bluebird", "Canary", "Goldfinch", "Redwing", "Starling",
  "Catfish", "Trout", "Salmon", "Pike", "Bass", "Perch", "Minnow", "Guppy",
  "Angelfish", "Clownfish", "Pufferfish",
] as const;
