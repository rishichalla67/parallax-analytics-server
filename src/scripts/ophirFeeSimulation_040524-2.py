import numpy as np
import pandas as pd

# Simulation Parameters
TOTAL_DAYS = 365
TOTAL_SUPPLY = 1_000_000_000
INITIAL_SUPPLY = 1_000_000_000
UNALLOCATED_SUPPLY = TOTAL_SUPPLY - INITIAL_SUPPLY
INITIAL_AVERAGE_REDEMPTION_VOLUME = 1_000_000
ADD_BACK_MAX = 5_000_000
MOVING_AVERAGE_DAYS = 14
AVERAGE_RESPONSE = 0.3 #Any number between 0 & 1; Higher is less response to Average Ratio
DAILY_RESPONSE = -0.2 #Any number between 0 & -1; Lower is less response to Daily Ratio
TAMP_FACTOR = -3.5 #Range any number below 0. 0 Turns it off. 
TAMP_START = 0.25 #Fee Percentage when volume tamping begins
TIER_RANGES = {
    'low ': (1, 1_000_000),
    'normal': (1_000_001, 5_000_000),
    'high': (5_000_001, 25_000_000),
    'extreme': (25_000_001, 100_000_000)
}
TIER_PROBABILITIES = [0.50, 0.30, 0.17, 0.03]
UPPER_REDEMPTION_RANGE = 1000 #Maximum amount of redemptions per day

#Distributes Daily Volume amongst a random number of trades
def distribute_volume_among_trades(daily_volume):
    num_trades = np.random.randint(1, UPPER_REDEMPTION_RANGE)
    trade_volumes = np.random.dirichlet(np.ones(num_trades)) * daily_volume
    return trade_volumes, num_trades

#Adjusts the actual amount added back to the supply; Ranges between 1 & 0.01 while supply is between the two thresholds
def calculate_dynamic_weight(supply):
    upper_threshold = 1_000_000_000
    lower_threshold = 200_000_000
    thresholdDelta = upper_threshold - lower_threshold
    if supply <= 200_000_000:
        return 1
    else:
        if supply >= 800_000_000:
            return 0.01
        else:
    # Adjusted to approach 0 near upper_threshold and 1 near lower_threshold
            return ((thresholdDelta - supply) / (upper_threshold - lower_threshold)) + 0.01

#Measures the difference between avg and daily ratio; Calculates a weight for each based on the difference
def calculate_weight_based_on_difference(dailyAvgRatio, daily_ratio):
    difference = dailyAvgRatio - daily_ratio
   
    #Uses the response to calculate m (slope) in order to linearly transform the response the ratio delta into the respective weights for each
    mAvg = (1 - 0.5)/AVERAGE_RESPONSE
    mDay = (1 - 0.5)/DAILY_RESPONSE
    
    if difference < 0:
        normalized_difference = min((mDay * difference) + 0.5, 1)
        weight_for_daily = normalized_difference
        weight_for_avg = 1 - normalized_difference
    else:
        if difference == 0:
                weight_for_daily = 0.5
                weight_for_avg = 0.5
        else:
                normalized_difference = min((mAvg * difference) + 0.5, 1)
                weight_for_daily = 1 - normalized_difference
                weight_for_avg = normalized_difference
    return weight_for_avg, weight_for_daily

#Fee Calculation based on weights
def calculate_fee_with_dynamic_weight(weight_for_avg, weight_for_daily, dailyAvgRatio, daily_ratio):
    x = weight_for_avg * dailyAvgRatio + weight_for_daily * daily_ratio
    return min(1, (1 / (1 + np.exp(-10 * (x - 0.5)))) + (0.00830715 * np.exp(-7 * x)) + (0.00661 * x**2))

def calculate_feeRateFactor(dailyAvgVol, aggDailyVolume):
    denominator =  max(20_000_000 - (0.5 * dailyAvgVol), 5_000_000)
    feeRateFactor = (1 / denominator) * aggDailyVol + 1
    return feeRateFactor

# Initialize variables
supply = INITIAL_SUPPLY
average_redemption_volume = INITIAL_AVERAGE_REDEMPTION_VOLUME
average_supply = supply
redeemedOphir = UNALLOCATED_SUPPLY
day_records = []
avg_ratio = average_redemption_volume / average_supply

# Simulation loop
for day in range(1, TOTAL_DAYS + 1):

    tier = np.random.choice(list(TIER_RANGES.keys()), p=TIER_PROBABILITIES)
    daily_volume = np.random.uniform(*TIER_RANGES[tier])
    
    trade_volumes, num_trades = distribute_volume_among_trades(daily_volume)
    while sum(trade_volumes) >= supply:
        daily_volume = min(daily_volume, supply)
        trade_volumes, num_trades = distribute_volume_among_trades(daily_volume)
        if sum(trade_volumes) < supply:
            break
            
    fees_accumulated = 0
    cummulativeFeeRate = 0  
    tokens_redeemed_accumulated = 0
    tampAmt = 0
    supply_before_redemption = supply
    
    dailyRatio = []
    dailyFees = []
    dailyVolumes = []
    dailySupply = []
    dailyAvgWeight = []
    dailyDlyWeight = []
    dailyTampAmts = []
    
    #Processes each redemption
    for trade_volume in trade_volumes:
        
        if trade_volume >= supply:
            adjustVolume = trade_volume - supply
            daily_volume -= adjustVolume
            trade_volume -= adjustVolume
            adjustVolume = 0
        
        dailyVolumes.append(trade_volume)
        dailySupply.append(supply)  
        aggDailyVol = np.sum(dailyVolumes)
    
        daily_ratio = trade_volume / supply
        dailyAvgVol = (np.mean(dailyVolumes) + average_redemption_volume) / 2
        dailyAvgSupply = (np.mean(dailySupply) + average_supply) / 2 
        dailyAvgRatio = dailyAvgVol / dailyAvgSupply
    
        dailyRatio.append(daily_ratio)
    
        weight_for_avg, weight_for_daily = calculate_weight_based_on_difference(dailyAvgRatio, daily_ratio)
        dailyAvgWeight.append(weight_for_avg)
        dailyDlyWeight.append(weight_for_daily)
    
        fee_rate = calculate_fee_with_dynamic_weight(weight_for_avg, weight_for_daily, dailyAvgRatio, daily_ratio)
        feeRateFactor = calculate_feeRateFactor(dailyAvgVol, aggDailyVol)
        #feeRateFactor = ((1/20000000) * sum(dailyVolumes)) + 1
        fee_rate = min(fee_rate * feeRateFactor, 1)
        
        if TAMP_START < fee_rate <= 1 and TAMP_FACTOR < 0:
            # Apply the tamp function based on the fee_rate now
            tampAmt = 0
            volumeTamp = min(np.exp(TAMP_FACTOR * (fee_rate - 0.5)), .99) # Reusing TAMP_FACTOR with a modified context
            tampAmt =+ (trade_volume * volumeTamp)
            adjustVolume = trade_volume * (1 - volumeTamp) # Adjust trade_volume based on new tamp
            dailyTampAmts.append(tampAmt)
            if adjustVolume >= supply:
                    adjustVolume = supply
            dailyVolAdjust = trade_volume - adjustVolume
            daily_volume -= dailyVolAdjust # Adjust daily_volume accordingly
            trade_volume = adjustVolume
            daily_ratio = trade_volume / supply
            dailyVolumes.pop()
            dailyVolumes.append(trade_volume)
            dailyAvgVol = (np.mean(dailyVolumes) + average_redemption_volume) / 2
            dailyAvgRatio = dailyAvgVol / dailyAvgSupply
            weight_for_avg, weight_for_daily = calculate_weight_based_on_difference(dailyAvgRatio, daily_ratio)
            dailyAvgWeight.pop()
            dailyDlyWeight.pop()
            dailyAvgWeight.append(weight_for_avg)
            dailyDlyWeight.append(weight_for_daily)
            fee_rate = calculate_fee_with_dynamic_weight(weight_for_avg, weight_for_daily, dailyAvgRatio, trade_volume / supply) * feeRateFactor
            feeRateFactor = calculate_feeRateFactor(dailyAvgVol, aggDailyVol)
            #feeRateFactor = ((1/20000000) * sum(dailyVolumes)) + 1
            fee_rate = min(fee_rate, 1) # Ensure fee_rate does not exceed 1
            
        
        fees = trade_volume * fee_rate
        dailyFees.append(fee_rate)
        
        tokens_redeemed = trade_volume - fees
        fees_accumulated += fees
        tokens_redeemed_accumulated += tokens_redeemed 
        supply -= tokens_redeemed
        redeemedOphir += tokens_redeemed
    
    maxDailyFee = max(dailyFees)
    maxVolume = max(trade_volumes)
    minDailyFee = min(dailyFees)
    minVolume = min(trade_volumes)
    
    totalAmtTamp = sum(dailyTampAmts)
    
    avgAvgWeight = np.mean(dailyAvgWeight)
    avgDlyWeight = np.mean(dailyDlyWeight)
    
    avgDlyRatio = np.mean(dailyRatio)
    dlyAvgFee = np.mean(dailyFees)
    avgVolRedeem = daily_volume / num_trades
    
    dynamic_weight = calculate_dynamic_weight(supply)
    potential_add_back = np.random.uniform(0, ADD_BACK_MAX)
    actual_add_back = potential_add_back * dynamic_weight
    
    supply += actual_add_back
    redeemedOphir -= actual_add_back
    
    if day > MOVING_AVERAGE_DAYS:
        # Make sure to collect only the last MOVING_AVERAGE_DAYS records
        recent_volumes = [record[14] for record in day_records[-MOVING_AVERAGE_DAYS:]]
        average_redemption_volume = np.mean(recent_volumes)
        
        recent_supplies = [record[13] for record in day_records[-MOVING_AVERAGE_DAYS:]]
        average_supply = np.mean(recent_supplies)
    else:
        # In early days, just accumulate the values
        average_redemption_volume = ((average_redemption_volume * (day - 1)) + daily_volume) / day
        average_supply = ((average_supply * (day - 1)) + supply) / day
    
    avg_ratio = average_redemption_volume / average_supply
    
    ratio_delta = avg_ratio - avgDlyRatio
    inputRatio = (avgAvgWeight*avg_ratio)+(avgDlyWeight*avgDlyRatio)
   
    if ratio_delta < 0:
        dailyFeeRate = calculate_fee_with_dynamic_weight(0,1,0,daily_ratio)
        feeDiscount = dailyFeeRate - fee_rate
    elif ratio_delta > 0:
        avgFeeRate = calculate_fee_with_dynamic_weight(1,0,avg_ratio,0)
        feeDiscount = avgFeeRate - fee_rate
    else:
        feeDiscount = 0    
        
    if UNALLOCATED_SUPPLY > 0:
        unallocatedAdded = np.random.uniform(400_000, ADD_BACK_MAX)
        actualUnalloactedAdded = min(unallocatedAdded * dynamic_weight, UNALLOCATED_SUPPLY)
        UNALLOCATED_SUPPLY -= actualUnalloactedAdded
        redeemedOphir -= actualUnalloactedAdded
        supply += actualUnalloactedAdded
    else:
        actualUnalloactedAdded = 0
        
    totalAdded = actual_add_back + actualUnalloactedAdded

     # Append day's record
    day_records.append([
        day, num_trades, avgVolRedeem, dlyAvgFee, minDailyFee, minVolume, maxVolume, maxDailyFee, feeDiscount,
        supply_before_redemption, totalAmtTamp, daily_volume, dailyAvgVol, dailyAvgSupply, tokens_redeemed_accumulated,
        fees_accumulated, totalAdded, supply, redeemedOphir, UNALLOCATED_SUPPLY, avg_ratio, avgDlyRatio,
        ratio_delta, avgAvgWeight, avgDlyWeight, inputRatio
    ])


# DataFrame and CSV export
columns = [
    "Day", "Number of Redemptions", "Avg Vol per Redemption", "Fee %", "Min Fee", "Min Volume",
    "Max Volume", "Max Fee", "Fee Discount", "Supply Before Redemption", "Total Tamp", "Daily Volume",
    "Average Redemption Volume", "Average Supply", "Total Redeemed", "Total Fees", "Total Added to Supply",
    "Supply EOD", "Ophir in Treasury", "Unallocated Ophir", "Average Ratio per Redemption",
    "Daily Ratio per Redemption", "Ratio Delta", "Average Weight", "Daily Weight", "Input Ratio"
]

df = pd.DataFrame(day_records, columns=columns)

constants_data = {
    'Constant Name': ['TOTAL_DAYS', 'TOTAL_SUPPLY', 'INITIAL_SUPPLY', 'UNALLOCATED_SUPPLY', 'INITIAL_AVERAGE_REDEMPTION_VOLUME',
                      'ADD_BACK_MAX', 'MOVING_AVERAGE_DAYS', 'AVERAGE_RESPONSE', 'DAILY_RESPONSE', 'TAMP_FACTOR', 
                      'TAMP_START', 'UPPER_REDEMPTION_RANGE'],
    'Value': [TOTAL_DAYS, TOTAL_SUPPLY, INITIAL_SUPPLY, UNALLOCATED_SUPPLY, INITIAL_AVERAGE_REDEMPTION_VOLUME,
              ADD_BACK_MAX, MOVING_AVERAGE_DAYS, AVERAGE_RESPONSE, DAILY_RESPONSE, TAMP_FACTOR,
              TAMP_START, UPPER_REDEMPTION_RANGE]
}

constants_df = pd.DataFrame(constants_data)

tier_ranges_data = [{'Tier': tier, 'Range Start': rng[0], 'Range End': rng[1]} for tier, rng in TIER_RANGES.items()]
tier_ranges_df = pd.DataFrame(tier_ranges_data)

tier_probabilities_data = {'Tier': list(TIER_RANGES.keys()), 'Probability': TIER_PROBABILITIES}
tier_probabilities_df = pd.DataFrame(tier_probabilities_data)

csv_path = "C:/Users/pmwyl/Documents/Crypto/Ophir DAO/Dev/Simuls/OphirSimul_Dly15_Avg30_Normal_LightTamp.csv"

# Export both DataFrames to a single CSV
with open(csv_path, 'w', newline='') as f:
    df.to_csv(f, index=False)
    f.write('\nConstants and Initial Setup\n')
    constants_df.to_csv(f, index=False)
    f.write('\nTier Ranges\n')
    tier_ranges_df.to_csv(f, index=False)
    f.write('\nTier Probabilities\n')
    tier_probabilities_df.to_csv(f, index=False)