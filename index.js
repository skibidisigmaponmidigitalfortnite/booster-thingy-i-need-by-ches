// index.js - Main bot file
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Create a new client instance
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ] 
});

// Your configuration - Using environment variables for security
const BOT_TOKEN = process.env.BOT_TOKEN; // Bot token from environment variable
const SERVER_ID = process.env.SERVER_ID || "1392643776899711106"; // Your server ID
const REQUIRED_ROLE_ID = process.env.REQUIRED_ROLE_ID || "1399599067180302417"; // Your required role ID

// Store verification codes temporarily (in production, use a database)
const verificationCodes = new Map();

// Clean up expired codes every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [code, data] of verificationCodes) {
        if (now - data.timestamp > 600000) { // 10 minutes in milliseconds
            verificationCodes.delete(code);
        }
    }
}, 300000); // 5 minutes

// Generate random 6-digit code
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Slash command definition
const verifyCommand = new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account for booster rewards')
    .addStringOption(option =>
        option.setName('roblox_username')
            .setDescription('Your exact Roblox username')
            .setRequired(true)
    );

// Handle interactions (slash commands)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'verify') {
        const robloxUsername = interaction.options.getString('roblox_username');
        const discordUserId = interaction.user.id;
        
        try {
            // Get the guild (server)
            const guild = interaction.guild;
            if (!guild) {
                return interaction.reply({ 
                    content: '❌ This command can only be used in the server!', 
                    ephemeral: true 
                });
            }
            
            // Get member info
            const member = await guild.members.fetch(discordUserId);
            if (!member) {
                return interaction.reply({ 
                    content: '❌ Could not find your server membership!', 
                    ephemeral: true 
                });
            }
            
            // Check if user is a booster
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
            
            // Check if user already has a pending verification
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
            
            // Store the verification code
            verificationCodes.set(verificationCode, {
                discordUserId: discordUserId,
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
            
            // Send verification code
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
                // DM failed, but that's okay - they got the ephemeral response
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
});

// Optional: Add a command to check verification status
const statusCommand = new SlashCommandBuilder()
    .setName('verification-status')
    .setDescription('Check if you have a pending verification code');

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

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
    const commands = [verifyCommand, statusCommand];
    
    try {
        console.log('Started refreshing application (/) commands.');
        
        // Register commands globally
        await client.application.commands.set(commands);
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Bot ready event
client.once('ready', () => {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    registerCommands();
});

// Error handling
client.on('error', console.error);

// Login the bot
client.login(BOT_TOKEN);

// Export for potential external access (optional)
module.exports = { verificationCodes };
