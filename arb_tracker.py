import os
import time
from datetime import datetime
from flask import Flask, jsonify, render_template_string, request
import requests
from dotenv import load_dotenv
import threading

# Initialize Flask app
app = Flask(__name__)

# Load environment variables
load_dotenv()

# Global variables for tracking
initial_investment = float(os.getenv('RANDS', 0))
usd_purchased = float(os.getenv('USD_PURCHASED', 0))
profit_history = []
last_refresh_time = None

def get_valr_usdc_zar_rate():
    """Fetches USDC/ZAR exchange rate from VALR."""
    try:
        api_key = os.getenv('VALR_API_KEY')
        headers = {'X-Api-Key': api_key}
        url = 'https://api.valr.com/v1/public/USDCZAR/marketsummary'
        response = requests.get(url, headers=headers)
        data = response.json()
        bid_price = data.get('bidPrice')
        if bid_price:
            return float(bid_price)
        else:
            return None
    except Exception as e:
        print(f"Error fetching VALR rate: {e}")
        return None

def get_exchange_rate():
    """Fetches the ZAR to USD exchange rate."""
    try:
        api_key = os.getenv('EXCHANGERATE_API_KEY')
        url = f"https://v6.exchangerate-api.com/v6/{api_key}/latest/ZAR"
        response = requests.get(url)
        data = response.json()
        if data['result'] == 'success':
            usd_to_zar_rate = 1 / data['conversion_rates']['USD']
            return usd_to_zar_rate
        else:
            return None
    except Exception as e:
        print(f"Error fetching exchange rate: {e}")
        return None

def calculate_arb_profit(usd_purchased=None):
    """Calculates current arbitrage profit."""
    if usd_purchased is None:
        usd_purchased = float(os.getenv('USD_PURCHASED', 0))
    
    # Get current rates
    highest_bid_rate = get_valr_usdc_zar_rate()
    market_rate = get_exchange_rate()
    
    if not highest_bid_rate or not market_rate:
        return None
    
    # Calculate fees
    wire_transfer_fee = max(0.0013 * usd_purchased, 10)
    usd_after_wire = usd_purchased - wire_transfer_fee
    
    # Calculate final ZAR amount
    tick_size = 0.001
    sell_rate = highest_bid_rate + tick_size
    zar_from_usdc = usd_after_wire * sell_rate
    withdrawal_fee = 30
    final_zar = zar_from_usdc - withdrawal_fee
    
    # Calculate profit
    profit = final_zar - initial_investment
    profit_percent = (profit / initial_investment) * 100 if initial_investment > 0 else 0
    
    # Calculate the rate difference (spread)
    spread = (highest_bid_rate / market_rate - 1) * 100
    
    return {
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'valr_rate': highest_bid_rate,
        'market_rate': market_rate,
        'spread': spread,
        'initial_zar': initial_investment,
        'usd_purchased': usd_purchased,
        'wire_fee': wire_transfer_fee,
        'final_zar': final_zar,
        'profit_zar': profit,
        'profit_percent': profit_percent
    }

def update_profit_history():
    """Updates profit history every 5 minutes."""
    global profit_history, last_refresh_time
    
    while True:
        result = calculate_arb_profit()
        if result:
            # Add timestamp as datetime for better sorting
            result['datetime'] = datetime.now()
            profit_history.append(result)
            # Keep only the last 1000 data points
            if len(profit_history) > 1000:
                profit_history = profit_history[-1000:]
            last_refresh_time = result['timestamp']
        time.sleep(300)  # 5 minute updates

@app.route('/')
def index():
    html = '''
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Arbitrage Profit Tracker</title>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/chart.js/3.9.1/chart.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js"></script>
        <style>
            :root {
                --bg-color: #f8f9fa;
                --text-color: #212529;
                --card-bg: #ffffff;
                --card-header-bg: #343a40;
                --card-header-text: #ffffff;
                --border-color: rgba(0,0,0,0.125);
                --chart-grid: rgba(0,0,0,0.1);
                --profit-positive: #28a745;
                --profit-negative: #dc3545;
                --secondary-text: #6c757d;
            }
            
            [data-theme="dark"] {
                --bg-color: #121212;
                --text-color: #e0e0e0;
                --card-bg: #1e1e1e;
                --card-header-bg: #2c2c2c;
                --card-header-text: #ffffff;
                --border-color: rgba(255,255,255,0.125);
                --chart-grid: rgba(255,255,255,0.1);
                --profit-positive: #4cd964;
                --profit-negative: #ff3b30;
                --secondary-text: #a0a0a0;
            }
            
            body {
                background-color: var(--bg-color);
                padding-top: 20px;
                color: var(--text-color);
                transition: background-color 0.3s ease;
            }
            
            .card {
                margin-bottom: 20px;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                background-color: var(--card-bg);
                border-color: var(--border-color);
                transition: background-color 0.3s ease;
            }
            
            .profit-positive {
                color: var(--profit-positive);
                font-weight: bold;
            }
            
            .profit-negative {
                color: var(--profit-negative);
                font-weight: bold;
            }
            
            .card-header {
                background-color: var(--card-header-bg);
                color: var(--card-header-text);
                border-radius: 10px 10px 0 0;
            }
            
            .refresh-btn {
                margin-left: 15px;
            }
            
            .chart-container {
                position: relative;
                height: 300px;
                width: 100%;
            }
            
            .big-number {
                font-size: 2.5rem;
                font-weight: bold;
            }
            
            #lastUpdated {
                font-size: 0.8rem;
                color: var(--secondary-text);
            }
            
            table {
                color: var(--text-color) !important;
            }
            
            input, select, textarea {
                background-color: var(--card-bg) !important;
                border-color: var(--border-color) !important;
                color: var(--text-color) !important;
            }
            
            .form-label {
                color: var(--text-color);
            }
            
            .theme-switch {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 1000;
            }
            
            .theme-btn {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.3s ease;
                border: none;
                background-color: var(--card-header-bg);
                color: var(--card-header-text);
            }
            
            .theme-btn:hover {
                transform: scale(1.1);
            }
            
            .theme-icon {
                font-size: 20px;
            }
        </style>
    </head>
    <body>
        <div class="theme-switch">
            <button id="themeToggle" class="theme-btn" aria-label="Toggle dark mode">
                <i id="themeIcon" class="theme-icon">🌙</i>
            </button>
        </div>
        
        <div class="container">
            <h1 class="text-center mb-4">Arbitrage Profit Tracker</h1>
            
            <div class="row mb-4">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Current Settings</h5>
                        </div>
                        <div class="card-body">
                            <form id="settingsForm">
                                <div class="mb-3">
                                    <label for="initialInvestment" class="form-label">Initial ZAR Investment</label>
                                    <input type="number" class="form-control" id="initialInvestment" name="initialInvestment">
                                </div>
                                <div class="mb-3">
                                    <label for="usdPurchased" class="form-label">USD Purchased</label>
                                    <input type="number" class="form-control" id="usdPurchased" name="usdPurchased">
                                </div>
                                <button type="submit" class="btn btn-primary">Update</button>
                            </form>
                        </div>
                    </div>
                </div>
                
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="card-title mb-0">Current Profit</h5>
                            <button id="refreshBtn" class="btn btn-sm btn-light refresh-btn">Refresh</button>
                        </div>
                        <div class="card-body text-center">
                            <div id="profitDisplay" class="big-number">-</div>
                            <div id="profitPercent">-</div>
                            <div id="lastUpdated">Last updated: Never</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Trading Details</h5>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <table class="table">
                                        <tr>
                                            <td>VALR USDC/ZAR Rate:</td>
                                            <td id="valrRate">-</td>
                                        </tr>
                                        <tr>
                                            <td>Market ZAR/USD Rate:</td>
                                            <td id="marketRate">-</td>
                                        </tr>
                                        <tr>
                                            <td>Current Spread:</td>
                                            <td id="currentSpread">-</td>
                                        </tr>
                                    </table>
                                </div>
                                <div class="col-md-6">
                                    <table class="table">
                                        <tr>
                                            <td>Wire Transfer Fee:</td>
                                            <td id="wireFee">-</td>
                                        </tr>
                                        <tr>
                                            <td>Final ZAR Amount:</td>
                                            <td id="finalZar">-</td>
                                        </tr>
                                        <tr>
                                            <td>Net Profit (ZAR):</td>
                                            <td id="netProfit">-</td>
                                        </tr>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row mt-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Profit History</h5>
                        </div>
                        <div class="card-body">
                            <div class="chart-container">
                                <canvas id="profitChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            // Theme handling
            let currentTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', currentTheme);
            
            // Update theme toggle button
            function updateThemeIcon() {
                const themeIcon = document.getElementById('themeIcon');
                if (currentTheme === 'dark') {
                    themeIcon.textContent = '☀️';
                } else {
                    themeIcon.textContent = '🌙';
                }
            }
            
            document.addEventListener('DOMContentLoaded', function() {
                updateThemeIcon();
                
                // Theme toggle functionality
                document.getElementById('themeToggle').addEventListener('click', function() {
                    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
                    document.documentElement.setAttribute('data-theme', currentTheme);
                    localStorage.setItem('theme', currentTheme);
                    updateThemeIcon();
                    
                    // Update chart theme if it exists
                    if (profitChart) {
                        updateChartTheme();
                        profitChart.update();
                    }
                });
                
                initChart();
                refreshData();
                
                // Auto refresh every 60 seconds
                setInterval(refreshData, 60000);
            });
            
            // Function to update chart theme
            function updateChartTheme() {
                const isDark = currentTheme === 'dark';
                const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                const textColor = isDark ? '#e0e0e0' : '#666';
                
                profitChart.options.scales.x.grid.color = gridColor;
                profitChart.options.scales.y.grid.color = gridColor;
                profitChart.options.scales.y1.grid.color = gridColor;
                
                profitChart.options.scales.x.ticks.color = textColor;
                profitChart.options.scales.y.ticks.color = textColor;
                profitChart.options.scales.y1.ticks.color = textColor;
                
                profitChart.options.scales.x.title.color = textColor;
                profitChart.options.scales.y.title.color = textColor;
                profitChart.options.scales.y1.title.color = textColor;
            }
            // Initial data
            let initialInvestment = {{initial_investment}};
            let usdPurchased = {{usd_purchased}};
            let profitHistory = [];
            let profitChart;
            
            // Initialize the form values
            document.getElementById('initialInvestment').value = initialInvestment;
            document.getElementById('usdPurchased').value = usdPurchased;
            
            // Handle form submission
            document.getElementById('settingsForm').addEventListener('submit', function(e) {
                e.preventDefault();
                initialInvestment = parseFloat(document.getElementById('initialInvestment').value) || 0;
                usdPurchased = parseFloat(document.getElementById('usdPurchased').value) || 0;
                
                // Save settings via API
                fetch('/update_settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        initial_investment: initialInvestment,
                        usd_purchased: usdPurchased
                    }),
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('Settings updated successfully!');
                        refreshData();
                    }
                });
            });
            
            // Initialize the chart
            function initChart() {
                const ctx = document.getElementById('profitChart').getContext('2d');
                const isDark = currentTheme === 'dark';
                const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                const textColor = isDark ? '#e0e0e0' : '#666';
                
                profitChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [
                            {
                                label: 'Profit (ZAR)',
                                data: [],
                                borderColor: 'rgba(40, 167, 69, 1)',
                                backgroundColor: 'rgba(40, 167, 69, 0.1)',
                                borderWidth: 2,
                                tension: 0.4,
                                fill: true
                            },
                            {
                                label: 'Spread (%)',
                                data: [],
                                borderColor: 'rgba(0, 123, 255, 1)',
                                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                                borderWidth: 2,
                                tension: 0.4,
                                fill: true,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false,
                        },
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let label = context.dataset.label || '';
                                        if (label) {
                                            label += ': ';
                                        }
                                        if (context.datasetIndex === 0) {
                                            label += new Intl.NumberFormat('en-ZA', { 
                                                style: 'currency', 
                                                currency: 'ZAR' 
                                            }).format(context.raw);
                                        } else {
                                            label += context.raw.toFixed(2) + '%';
                                        }
                                        return label;
                                    }
                                }
                            },
                            legend: {
                                position: 'top',
                                labels: {
                                    color: textColor
                                }
                            }
                        },
                        scales: {
                            x: {
                                title: {
                                    display: true,
                                    text: 'Time',
                                    color: textColor
                                },
                                ticks: {
                                    color: textColor
                                },
                                grid: {
                                    color: gridColor
                                }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: 'Profit (ZAR)',
                                    color: textColor
                                },
                                ticks: {
                                    callback: function(value) {
                                        return 'R' + value.toLocaleString();
                                    },
                                    color: textColor
                                },
                                grid: {
                                    color: gridColor
                                }
                            },
                            y1: {
                                position: 'right',
                                title: {
                                    display: true,
                                    text: 'Spread (%)',
                                    color: textColor
                                },
                                ticks: {
                                    callback: function(value) {
                                        return value.toFixed(2) + '%';
                                    },
                                    color: textColor
                                },
                                grid: {
                                    color: gridColor,
                                    drawOnChartArea: false
                                }
                            }
                        }
                    }
                });
            }
            
            // Update the chart with new data
            function updateChart(history) {
                if (!profitChart) {
                    initChart();
                }
                
                // Sort by timestamp to ensure correct chronological order
                history.sort((a, b) => {
                    return new Date(a.timestamp) - new Date(b.timestamp);
                });
                
                // Format timestamps for better display
                const labels = history.map(item => {
                    return moment(item.timestamp).format('MMM D, HH:mm');
                });
                
                const profitData = history.map(item => item.profit_zar);
                const spreadData = history.map(item => item.spread);
                
                // Add annotations for key events (max profit, min profit)
                let maxProfit = Math.max(...profitData);
                let minProfit = Math.min(...profitData);
                let maxProfitIndex = profitData.indexOf(maxProfit);
                let minProfitIndex = profitData.indexOf(minProfit);
                
                profitChart.data.labels = labels;
                profitChart.data.datasets[0].data = profitData;
                profitChart.data.datasets[1].data = spreadData;
                
                // Add point styles to highlight max and min points
                profitChart.data.datasets[0].pointRadius = profitData.map((value, index) => {
                    return (index === maxProfitIndex || index === minProfitIndex) ? 6 : 3;
                });
                
                profitChart.data.datasets[0].pointBackgroundColor = profitData.map((value, index) => {
                    if (index === maxProfitIndex) return 'rgba(0, 200, 0, 1)';
                    if (index === minProfitIndex) return 'rgba(255, 0, 0, 1)';
                    return 'rgba(40, 167, 69, 1)';
                });
                
                profitChart.update();
            }
            
            // Refresh data from the server
            function refreshData() {
                fetch('/get_profit_data?usd_purchased=' + usdPurchased)
                    .then(response => response.json())
                    .then(data => {
                        // Update the UI with current profit data
                        document.getElementById('profitDisplay').textContent = 
                            new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' })
                            .format(data.profit_zar);
                        
                        document.getElementById('profitDisplay').className = 
                            data.profit_zar >= 0 ? 'big-number profit-positive' : 'big-number profit-negative';
                        
                        document.getElementById('profitPercent').textContent = 
                            data.profit_percent.toFixed(2) + '%';
                        
                        document.getElementById('profitPercent').className = 
                            data.profit_percent >= 0 ? 'profit-positive' : 'profit-negative';
                        
                        document.getElementById('lastUpdated').textContent = 
                            'Last updated: ' + data.timestamp;
                        
                        // Update trading details
                        document.getElementById('valrRate').textContent = 
                            data.valr_rate.toFixed(4);
                        
                        document.getElementById('marketRate').textContent = 
                            data.market_rate.toFixed(4);
                        
                        document.getElementById('currentSpread').textContent = 
                            data.spread.toFixed(2) + '%';
                        
                        document.getElementById('wireFee').textContent = 
                            new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
                            .format(data.wire_fee);
                        
                        document.getElementById('finalZar').textContent = 
                            new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' })
                            .format(data.final_zar);
                        
                        document.getElementById('netProfit').textContent = 
                            new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' })
                            .format(data.profit_zar);
                        
                        document.getElementById('netProfit').className = 
                            data.profit_zar >= 0 ? 'profit-positive' : 'profit-negative';
                    })
                    .catch(error => {
                        console.error('Error fetching profit data:', error);
                    });
                
                // Fetch profit history for the chart
                fetch('/get_profit_history')
                    .then(response => response.json())
                    .then(data => {
                        profitHistory = data;
                        updateChart(data);
                    })
                    .catch(error => {
                        console.error('Error fetching profit history:', error);
                    });
            }
            
            // Add click event for refresh button
            document.getElementById('refreshBtn').addEventListener('click', refreshData);
            
            // Initialize data on page load
            document.addEventListener('DOMContentLoaded', function() {
                initChart();
                refreshData();
                
                // Auto refresh every 60 seconds
                setInterval(refreshData, 60000);
            });
        </script>
    </body>
    </html>
    '''
    return render_template_string(html, initial_investment=initial_investment, usd_purchased=usd_purchased)

@app.route('/get_profit_data')
def get_profit_data():
    usd_purchased_param = request.args.get('usd_purchased')
    if usd_purchased_param:
        usd_purchased_value = float(usd_purchased_param)
    else:
        usd_purchased_value = usd_purchased
    
    result = calculate_arb_profit(usd_purchased_value)
    if result:
        # Save to profit history if data was successfully calculated
        if not any(history_item.get('timestamp') == result.get('timestamp') for history_item in profit_history):
            result_copy = result.copy()
            result_copy['datetime'] = datetime.now()
            profit_history.append(result_copy)
            
            # Keep only the last 1000 data points
            if len(profit_history) > 1000:
                profit_history.sort(key=lambda x: x.get('datetime', datetime.now()) 
                                 if isinstance(x.get('datetime'), datetime) 
                                 else datetime.strptime(x.get('timestamp', ''), '%Y-%m-%d %H:%M:%S'))
                profit_history.pop(0)
                
        return jsonify(result)
    else:
        return jsonify({'error': 'Failed to calculate profit'}), 500

@app.route('/get_profit_history')
def get_profit_history():
    # Make a copy of the history to avoid modifying the original
    history_copy = profit_history.copy()
    
    # Sort by timestamp to ensure correct chronological order
    history_copy.sort(key=lambda x: x.get('datetime', datetime.now()) 
                     if isinstance(x.get('datetime'), datetime) 
                     else datetime.strptime(x.get('timestamp', ''), '%Y-%m-%d %H:%M:%S'))
    
    # Remove datetime object for serialization
    for item in history_copy:
        if 'datetime' in item:
            del item['datetime']
            
    return jsonify(history_copy)

@app.route('/update_settings', methods=['POST'])
def update_settings():
    global initial_investment, usd_purchased
    data = request.json
    
    if 'initial_investment' in data:
        initial_investment = float(data['initial_investment'])
    
    if 'usd_purchased' in data:
        usd_purchased = float(data['usd_purchased'])
    
    # Update environment variables in .env file
    with open('.env', 'r') as file:
        lines = file.readlines()
    
    with open('.env', 'w') as file:
        for line in lines:
            if line.startswith('RANDS='):
                file.write(f'RANDS={initial_investment}\n')
            elif line.startswith('USD_PURCHASED='):
                file.write(f'USD_PURCHASED={usd_purchased}\n')
            else:
                file.write(line)
    
    return jsonify({'success': True})

if __name__ == "__main__":
    # Start the background thread for updating profit history
    thread = threading.Thread(target=update_profit_history, daemon=True)
    thread.start()
    
    # Run the Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)