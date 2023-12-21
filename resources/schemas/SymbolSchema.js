class SymbolSchema {
    constructor(symbolData) {
        this.id = symbolData.id; // "bitcoin"
        this.symbol = symbolData.symbol; // "btc"
        this.name = symbolData.name; // "Bitcoin"
        this.image = symbolData.image; // "https://assets.coingecko.com/coins/images/1/large/bitcoin.png?1696501400"
        this.current_price = symbolData.current_price; // 43630
        this.market_cap = symbolData.market_cap; // 854012244623
        this.market_cap_rank = symbolData.market_cap_rank; // 1
        this.fully_diluted_valuation = symbolData.fully_diluted_valuation; // 916139924604
        this.total_volume = symbolData.total_volume; // 28415939279
        this.high_24h = symbolData.high_24h; // 44201
        this.low_24h = symbolData.low_24h; // 42238
        this.price_change_24h = symbolData.price_change_24h; // 1326.15
        this.price_change_percentage_24h = symbolData.price_change_percentage_24h; // 3.1348
        this.market_cap_change_24h = symbolData.market_cap_change_24h; // 25936223830
        this.market_cap_change_percentage_24h = symbolData.market_cap_change_percentage_24h; // 3.13211
        this.circulating_supply = symbolData.circulating_supply;
        this.total_supply = symbolData.total_supply;
        this.max_supply = symbolData.max_supply;
        this.updateLast24Hr = true;
    }
}