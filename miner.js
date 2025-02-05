// miner.js
import axios from 'axios'
import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {displayBanner} from './banner.js';

export class KaleidoMiningBot extends EventEmitter {
    constructor(wallet, botIndex) {
        super();
        this.wallet = wallet;
        this.botIndex = botIndex;
        this.currentEarnings = { total: 0, pending: 0, paid: 0 };
        this.miningState = {
            isActive: false,
            worker: "quantum-rig-1",
            pool: "quantum-1",
            startTime: null
        };
        this.referralBonus = 0;
        this.stats = {
            hashrate: 75.5,
            shares: { accepted: 0, rejected: 0 },
            efficiency: 1.4,
            powerUsage: 120
        };
        
        this.api = axios.create({
            baseURL: 'https://kaleidofinance.xyz/api/testnet',
            headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://kaleidofinance.xyz/testnet',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
            }
        });
    }

    async initialize() {
        try {
            // 1. Check registration status
            const regResponse = await this.retryRequest(
                () => this.api.get(`/check-registration?wallet=${this.wallet}`),
                "Registration check"
            );

            if (!regResponse.data.isRegistered) {
                throw new Error('Wallet not registered');
            }
            
            // 2. Initialize mining parameters from server response
            this.referralBonus = regResponse.data.userData.referralBonus;
            this.currentEarnings = {
                total: regResponse.data.userData.referralBonus || 0,
                pending: 0,
                paid: 0
            };

            // 3. Start mining session
            this.miningState.startTime = Date.now();
            this.miningState.isActive = true;
            
            this.startMiningLoop();
            return true;

        } catch (error) {
            this.emit('error', error.message);
            return false;
        }
    }

    async retryRequest(requestFn, operationName, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                return await requestFn();
            } catch (error) {
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
            }
        }
    }

    calculateEarnings() {
        const timeElapsed = (Date.now() - this.miningState.startTime) / 1000;
        return (this.stats.hashrate * timeElapsed * 0.0001) * (1 + this.referralBonus);
    }

    async updateBalance(finalUpdate = false) {
        try {
            const newEarnings = this.calculateEarnings();
            const payload = {
                wallet: this.wallet,
                earnings: {
                    total: this.currentEarnings.total + newEarnings,
                    pending: finalUpdate ? 0 : newEarnings,
                    paid: finalUpdate ? this.currentEarnings.paid + newEarnings : this.currentEarnings.paid
                }
            };

            const response = await this.retryRequest(
                () => this.api.post('/update-balance', payload),
                "Balance update"
            );

            if (response.data.success) {
                this.currentEarnings = {
                    total: response.data.balance,
                    pending: finalUpdate ? 0 : newEarnings,
                    paid: finalUpdate ? this.currentEarnings.paid + newEarnings : this.currentEarnings.paid
                };
                
                this.emitStatus();
            }
        } catch (error) {
            this.emit('error', error.message);
        }
    }

    emitStatus() {
        const uptime = ((Date.now() - this.miningState.startTime) / 1000).toFixed(0);
        this.emit('status-update', {
            hashrate: this.stats.hashrate,
            totalEarned: this.currentEarnings.total.toFixed(8),
            pendingRewards: this.currentEarnings.pending.toFixed(8),
            uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
            efficiency: this.stats.efficiency,
            isActive: this.miningState.isActive
        });
    }

    async startMiningLoop() {
        while (this.miningState.isActive) {
            await this.updateBalance();
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }

    async stop() {
        this.miningState.isActive = false;
        await this.updateBalance(true);
        this.emit('stopped');
        return this.currentEarnings.paid;
    }
}

export class MiningCoordinator {
    constructor() {
        this.bots = [];
        this.totalPaid = 0;
    }

    async loadWallets() {
        try {
          const __dirname = dirname(fileURLToPath(import.meta.url));
            const data = await fs.readFile(join(__dirname, 'wallets.txt'), 'utf8');
            return data.split('\n')
                .map(line => line.trim())
                .filter(line => line.startsWith('0x'));
        } catch (error) {
            console.error('Error loading wallets:', error.message);
            return [];
        }
    }

    async start() {
        displayBanner();
        const wallets = await this.loadWallets();
        
        if (wallets.length === 0) {
            console.log(chalk.red('No valid wallets found in wallets.txt'));
            return;
        }

        console.log(chalk.blue(`Loaded ${wallets.length} wallets\n`));

        // Initialize all bots
        this.bots = wallets.map((wallet, index) => {
            const bot = new KaleidoMiningBot(wallet, index + 1);
            bot.initialize();
            return bot;
        });

        // Handle shutdown
        process.on('SIGINT', async () => {
            console.log(chalk.yellow('\nShutting down miners...'));
            this.totalPaid = (await Promise.all(this.bots.map(bot => bot.stop())))
                .reduce((sum, paid) => sum + paid, 0);
            
            console.log(chalk.green(`
            === Final Summary ===
            Total Wallets: ${this.bots.length}
            Total Paid: ${this.totalPaid.toFixed(8)} KLDO
            `));
            process.exit();
        });
    }
}

// Start mining operation
new MiningCoordinator().start().catch(console.error);