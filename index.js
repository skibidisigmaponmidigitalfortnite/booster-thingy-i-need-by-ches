// index.js - Enhanced Discord bot with API endpoint
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');

// Create Express app for API endpoints
const app = express();
app.use(cors());
app.use(express.json());

// Create a new Discord client instance
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ] 
});

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const SERVER_ID = process.env.SERVER_ID || "1392643776899711106";
const REQUIRED_ROLE_ID = process.env.REQUIRED_ROLE_ID || "1399599067180302417";
const API_PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || "your-secret-key"; // For securing the API

// Store verification codes temporarily
const verificationCodes = new Map();

// Clean up expired codes every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [code, data] of verificationCodes) {
        if (now - data.timestamp > 600000) { // 10 minutes
            verificationCodes.delete(code);
        }
    }
}, 300000);

// Generate random 6-digit code
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// API endpoint to verify codes (called by Roblox)
app.post('/verify-code', (req, res) => {
    const { code, roblox_username } = req.body;
    const authHeader = req.headers.authorization;
    
    // Basic authentication (you might want to improve this)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    // Validate request
    if (!code || !roblox_username) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing code or roblox_username' 
        });
    }
    
    // Check if code exists
    const codeData = verificationCodes.get(code);
    if (!codeData) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid or expired verification code' 
        });
    }
    
    // Check if the Roblox username matches
    if (codeData.robloxUsername.toLowerCase() !== roblox_username.toLowerCase()) {
        return res.status(400).json({ 
            success: false, 
            error: 'Roblox username does not match the verification request' 
        });
    }
    
    // Success! Remove the used code and return success
    verificationCodes.delete(code);
    
    res.json({ 
        success: true, 
        discord_user_id: codeData.discordUserId,
        discord_username: codeData.discordUsername || 'Unknown',
        roblox_username: codeData.robloxUsername
    });
});

// API endpoint to check code status
app.get('/check-code/:code', (req, res) => {
    const { code } = req.params;
    const codeData = verificationCodes.get(code);
    
    if (!codeData) {
        return res.status(404).json({ 
            success: false, 
            error: 'Code not found or expired' 
        });
    }
    
    const timeRemaining = Math.ceil((600000 - (Date.now() - codeData.timestamp)) / 1000);
    
    res.json({
        success: true,
        roblox_username: codeData.robloxUsername,
        time_remaining: timeRemaining,
        expires_at: new Date(codeData.timestamp + 600000).toISOString()
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        bot_ready: client.isReady(),
        active_codes: verificationCodes.size 
    });
});

// Slash command definitions
const verifyCommand = new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account for booster rewards')
    .addStringOption(option =>
        option.setName('roblox_username')
            .setDescription('Your exact Roblox username')
            .setRequired(true)
    );

const statusCommand = new SlashCommandBuilder()
    .setName('verification-status')
    .setDescription('Check if you have a pending verification code');

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'verify') {
        const robloxUsername = interaction.options.getString('roblox_username');
        const discordUserId = interaction.user.id;
        
        try {
            const guild = interaction.guild;
            if (!guild) {
                return interaction.reply({ 
                    content: '❌ This command can only be used in the server!', 
                    ephemeral: true 
                });
            }
            
            const member = await guild.members.fetch(discordUserId);
            if (!member) {
                return interaction.reply({ 
                    content: '❌ Could not find your server membership!', 
                    ephemeral: true 
                });
            }
            
            const isBooster = member.premiumSince !== null;
            const hasRequiredRole = member.roles.cache.has(REQUIRED_ROLE_ID);
            
            if (!isBooster) {
                return interaction.reply({ 
                    content: '❌ You must be a **Discord Server Booster** to use this command!\n\nBoost this server to unlock Roblox verification rewards!', 
                    ephemeral: true 
                });
            }
            
            if (!hasRequiredRole) {
                return interaction.reply({ 
                    content: '❌ You need the required role to verify! Contact an admin if you think this is a mistake.', 
                    ephemeral: true 
                });
            }
            
            // Check for existing code
            let existingCode = null;
            for (const [code, data] of verificationCodes) {
                if (data.discordUserId === discordUserId) {
                    existingCode = code;
                    break;
                }
            }
            
            if (existingCode) {
                const embed = new EmbedBuilder()
                    .setTitle('⏱️ Existing Verification Code')
                    .setDescription(`You already have a verification code: \`${existingCode}\`\n\n**Roblox Username:** ${verificationCodes.get(existingCode).robloxUsername}\n\nGo to your Roblox game and enter this code!`)
                    .setColor(0xffa500)
                    .setFooter({ text: 'Codes expire after 10 minutes' });
                
                return interaction.reply({ 
                    embeds: [embed], 
                    ephemeral: true 
                });
            }
            
            // Generate new verification code
            const verificationCode = generateVerificationCode();
            
            // Store the verification code with additional data
            verificationCodes.set(verificationCode, {
                discordUserId: discordUserId,
                discordUsername: interaction.user.username,
                robloxUsername: robloxUsername,
                timestamp: Date.now()
            });
            
            // Create embed for verification code
            const embed = new EmbedBuilder()
                .setTitle('🔐 Roblox Verification Code Generated')
                .setDescription(`**Roblox Username:** ${robloxUsername}\n**Verification Code:** \`${verificationCode}\`\n\n**Instructions:**\n1. Open your Roblox game\n2. Click the verification/booster GUI\n3. Enter the code above\n4. Enjoy your rewards!`)
                .setColor(0x00ff00)
                .setFooter({ text: 'This code expires in 10 minutes' })
                .setTimestamp();
            
            await interaction.reply({ 
                embeds: [embed], 
                ephemeral: true 
            });
            
            // Try to send DM as backup
            try {
                await interaction.user.send({ 
                    content: `🔐 Your Roblox verification code: \`${verificationCode}\`\nFor username: **${robloxUsername}**` 
                });
            } catch (dmError) {
                console.log('Could not send DM to user:', interaction.user.tag);
            }
            
            console.log(`Generated verification code ${verificationCode} for ${interaction.user.tag} (${robloxUsername})`);
            
        } catch (error) {
            console.error('Verification error:', error);
            await interaction.reply({ 
                content: '❌ There was an error processing your verification. Please try again later.', 
                ephemeral: true 
            });
        }
    }

    if (interaction.commandName === 'verification-status') {
        const discordUserId = interaction.user.id;
        
        let userCode = null;
        let userData = null;
        
        for (const [code, data] of verificationCodes) {
            if (data.discordUserId === discordUserId) {
                userCode = code;
                userData = data;
                break;
            }
        }
        
        if (userCode) {
            const timeLeft = Math.ceil((600000 - (Date.now() - userData.timestamp)) / 1000 / 60);
            const embed = new EmbedBuilder()
                .setTitle('✅ Active Verification Code')
                .setDescription(`**Code:** \`${userCode}\`\n**Roblox Username:** ${userData.robloxUsername}\n**Time Remaining:** ~${timeLeft} minutes`)
                .setColor(0x00ff00);
            
            interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            interaction.reply({ 
                content: '❌ You don\'t have any pending verification codes. Use `/verify` to create one!', 
                ephemeral: true 
            });
        }
    }
});

// Register slash commands
async function registerCommands() {
    await client.application.fetch(); // IMPORTANT

    const commands = [verifyCommand, statusCommand];

    try {
        console.log("Registering slash commands...");
        await client.application.commands.set(commands);
        console.log("Commands registered.");
    } catch (err) {
        console.error("Error registering slash commands:", err);
    }
}


// Bot ready event
client.once('ready', () => {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    registerCommands();
});

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

// Start the API server
app.listen(API_PORT, () => {
    console.log(`🚀 API server running on port ${API_PORT}`);
});

// Login the bot
client.login(BOT_TOKEN);

// Export for potential external access
module.exports = { verificationCodes, app };
