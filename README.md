API Endpoints in ophir.js

Below is a summary of the API endpoints defined in the ophir.js file, along with their purposes:
/stats
- Method: GET
- Purpose: Fetches and returns statistics related to the Ophir token, including its price, market cap, fully diluted valuation (FDV), circulating supply, staked supply, total supply, and the amount of Ophir in the mine.
/treasury
- Method: GET
- Purpose: Retrieves and calculates the total value of the Ophir DAO treasury. It includes the total treasury value, the treasury value without considering the Ophir token, and the Ophir redemption price. It also caches the data for efficient retrieval.
/prices
- Method: GET
- Purpose: Provides the latest prices for various assets including Ophir, Whale, bWhale, ampWhale, wBTC, wBTCaxl, ampWHALEt, Luna, Ash, OphirWhaleLp, Kuji, WhalewBtcLp, and Sail. It calculates LP prices for certain pairs and fetches prices from external APIs.
External API Calls

The file also makes several external API calls to fetch data required for the endpoints above:

- Circulating Supply: https://therealsnack.com/ophircirculatingsupply
- White Whale Pool Data: https://www.api-white-whale.enigma-validator.com/summary/migaloo/all/current
- Ophir Staked Supply: https://migaloo.explorer.interbloc.org/account/migaloo1kv72vwfhq523yvh0gwyxd4nc7cl5pq32v9jt5w2tn57qtn57g53sghgkuh
- Ophir in Mine: https://migaloo.explorer.interbloc.org/account/migaloo1dpchsx70fe6gu9ljtnknsvd2dx9u7ztrxz9dr6ypfkj4fvv0re6qkdrwkh
- OphirWhale Pool Data: https://migaloo-lcd.erisprotocol.com/cosmwasm/wasm/v1/contract/migaloo1p5adwk3nl9pfmjjx6fu9mzn4xfjry4l2x086yq8u8sahfv6cmuyspryvyu/smart/eyJwb29sIjp7fX0=
- WhalewBtc Pool Data: https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo1axtz4y7jyvdkkrflknv9dcut94xr5k8m6wete4rdrw4fuptk896su44x2z/smart/eyJwb29sIjp7fX0=
- Coin Prices: Various endpoints from https://api-osmosis.imperator.co/tokens/v2/price/
- SailWhale LP Data: https://lcd.osmosis.zone/cosmwasm/wasm/v1/contract/osmo1w8e2wyzhrg3y5ghe9yg0xn0u7548e627zs7xahfvn5l63ry2x8zstaraxs/smart/ewogICJwb29sIjoge30KfQo=
- Ophir DAO Treasury Assets: https://migaloo.explorer.interbloc.org/account/migaloo10gj7p9tz9ncjk7fm7tmlax7q6pyljfrawjxjfs09a7e7g933sj0q7yeadc
- Migaloo Hot Wallet: https://migaloo.explorer.interbloc.org/account/migaloo19gc2kclw3ynjxl7wsddm5p08r5hu8a0gvzc4t3
- Alliance Staking Assets and Rewards: Various endpoints from https://phoenix-lcd.terra.dev/ and https://ww-migaloo-rest.polkachu.com/
- Staked Sail Amount: https://indexer.daodao.zone/osmosis-1/contract/osmo14gz8xpzm5sj9acxfmgzzqh0strtuyhce08zm7pmqlkq6n4g5g6wq0924n8/daoVotingTokenSt
