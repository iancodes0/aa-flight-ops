require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const discordClientId = process.env.DISCORD_CLIENT_ID || '1561441849129041991';
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
const oauthRedirectUri = process.env.DISCORD_REDIRECT_URI || 'https://iancodes0.github.io/aa-flight-ops/';
const flightPlanChannelId = '1554192355387646034';
const roleClaimGuildId = '1554169019098079314';
const websiteApiPort = Number(process.env.WEBSITE_API_PORT || 3001);
const websiteApiOrigin = process.env.WEBSITE_API_ORIGIN || '*';
const dataDirectory = path.join(__dirname, 'data');
const dataFile = path.join(dataDirectory, 'flight-data.json');
const websiteDirectory = path.join(__dirname, '..', 'website');
const sessions = new Map();
const flightData = loadFlightData();
if (!token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and add your bot token.');
  process.exit(1);
}

function loadFlightData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    return { plans: [], flights: [] };
  }
}

function saveFlightData() {
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(flightData, null, 2));
}

function createSession(user) {
  const session = crypto.randomBytes(32).toString('hex');
  sessions.set(session, { user, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  return session;
}

function getSession(request) {
  const authorization = request.headers.authorization || '';
  const sessionToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const session = sessions.get(sessionToken);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sessionToken);
    return null;
  }
  return session;
}

function jsonResponse(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': websiteApiOrigin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    request.on('data', chunk => {
      rawBody += chunk;
      if (rawBody.length > 20000) reject(new Error('Request is too large.'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(rawBody || '{}')); } catch { reject(new Error('Invalid JSON.')); }
    });
    request.on('error', reject);
  });
}

function publicUser(user) {
  return { id: user.id, username: user.username, globalName: user.global_name || user.username, avatar: user.avatar };
}

function userDashboard(userId) {
  const plans = flightData.plans.filter(plan => plan.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const flights = flightData.flights.filter(flight => flight.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { plans, flights, stats: { flights: flights.length, hours: flights.reduce((sum, flight) => sum + flight.durationMinutes, 0) / 60, miles: flights.reduce((sum, flight) => sum + (flight.distance || 0), 0) } };
}

function serveWebsite(request, response) {
  const requestedPath = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
  const filePath = path.resolve(websiteDirectory, relativePath);
  if (!filePath.startsWith(`${websiteDirectory}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Unable to load website.');
      return;
    }
    const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  });
}

function sendDiscordLogin(response) {
  const authorizeUrl = new URL('https://discord.com/oauth2/authorize');
  authorizeUrl.search = new URLSearchParams({ client_id: discordClientId, response_type: 'code', redirect_uri: oauthRedirectUri, scope: 'identify' });
  response.writeHead(302, { Location: authorizeUrl.toString() });
  response.end();
}

const commands = [
  new SlashCommandBuilder()
    .setName('logflight')
    .setDescription('Post a flight log to this channel.')
    .addStringOption(option => option.setName('departure_icao').setDescription('Departure airport ICAO code').setRequired(true).setMinLength(4).setMaxLength(4))
    .addStringOption(option => option.setName('arrival_icao').setDescription('Arrival airport ICAO code').setRequired(true).setMinLength(4).setMaxLength(4))
    .addStringOption(option => option.setName('aircraft').setDescription('Aircraft type or registration').setRequired(true).setMaxLength(100))
    .addIntegerOption(option => option.setName('hours').setDescription('Flight duration hours').setRequired(true).setMinValue(0).setMaxValue(99))
    .addIntegerOption(option => option.setName('minutes').setDescription('Flight duration minutes').setRequired(true).setMinValue(0).setMaxValue(59))
    .addAttachmentOption(option => option.setName('flight_image').setDescription('Required photo from the flight').setRequired(true))
    .addStringOption(option => option.setName('notes').setDescription('Optional flight notes').setRequired(false).setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName('faq')
    .setDescription('Create your private FAQ support channel (under development).'),
  new SlashCommandBuilder()
    .setName('joinstaralliance')
    .setDescription('Get the Star Alliance Discord invite link.'),
  new SlashCommandBuilder()
    .setName('claimroles')
    .setDescription('Assign every role this bot can manage to yourself.')
].map(command => command.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

const recentMessages = new Map();
const SPAM_WINDOW_MS = 7000;
const SPAM_LIMIT = 5;
// Common profanity variants and vulgar phrases; identity-targeted slurs are intentionally excluded.
const PROFANITY = /\b(?:motherfuck(?:er|ers|ing|ed|s)?|fuck(?:er|ers|ing|ed|s)?|bullshit|shit(?:ty|ting|ted|head|heads|s)?|piece\s+of\s+shit|bitch(?:es|y)?|son\s+of\s+a\s+bitch|ass(?:hole|holes|hat|hats|wipe|wipes|clown|es)?|arse(?:hole|holes)?|dumbass|jackass|badass|bastard(?:s)?|damn(?:ed|it)?|dammit|hell|piss(?:ed|es|ing|y)?|crap(?:py)?|dick(?:head|heads|s)?|prick(?:s|ly)?|cunt(?:s)?|cock(?:head|heads|s)?|twat(?:s)?|wank(?:er|ers|ing)?|tosser(?:s)?|bollocks?|bugger(?:s|ed|ing)?|bloody|douche(?:bag|bags|s)?)\b/i;

const AIRPORTS = {
  KDFW: [32.8998, -97.0403], KLAX: [33.9425, -118.4081], KJFK: [40.6413, -73.7781], KMIA: [25.7959, -80.287],
  KORD: [41.9742, -87.9073], KPHX: [33.4342, -112.0116], KCLT: [35.214, -80.9431], KSFO: [37.6213, -122.379],
  KATL: [33.6407, -84.4277], KDEN: [39.8561, -104.6737], CYYZ: [43.6777, -79.6248], EGLL: [51.47, -0.4543],
  EDDF: [50.0379, 8.5622], LFPG: [49.0097, 2.5479], RJTT: [35.5494, 139.7798],
};

function estimateFlight(departure, arrival, aircraft) {
  const origin = AIRPORTS[departure];
  const destination = AIRPORTS[arrival];
  if (!origin || !destination) return { distance: null, minutes: 120 };
  const radians = value => value * Math.PI / 180;
  const [lat1, lon1] = origin.map(radians);
  const [lat2, lon2] = destination.map(radians);
  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  const distance = Math.round(3959 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  const cruiseSpeed = /747|777|787|a330|a350/i.test(aircraft) ? 500 : /172|152|piper|cessna/i.test(aircraft) ? 125 : 460;
  return { distance, minutes: Math.max(35, Math.ceil((distance / cruiseSpeed) * 60 + 35)) };
}

function formatDuration(minutes) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

const flightPlanServer = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': websiteApiOrigin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
    response.end();
    return;
  }
  if (request.method === 'GET' && request.url.startsWith('/api/auth/login')) {
    sendDiscordLogin(response);
    return;
  }
  if (request.method === 'GET' && !request.url.startsWith('/api/')) {
    serveWebsite(request, response);
    return;
  }
  if (request.url === '/api/auth/exchange' && request.method === 'POST') {
    readJson(request).then(async body => {
      if (!discordClientSecret) throw new Error('Discord OAuth is not configured on the server.');
      if (!body.code || body.redirectUri !== oauthRedirectUri) throw new Error('Invalid OAuth request.');
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: discordClientId, client_secret: discordClientSecret, grant_type: 'authorization_code', code: body.code, redirect_uri: oauthRedirectUri }) });
      if (!tokenResponse.ok) throw new Error('Discord authorization code was rejected.');
      const oauthTokens = await tokenResponse.json();
      const userResponse = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${oauthTokens.access_token}` } });
      if (!userResponse.ok) throw new Error('Could not load your Discord profile.');
      const user = await userResponse.json();
      jsonResponse(response, 200, { token: createSession(user), user: publicUser(user) });
    }).catch(error => jsonResponse(response, 400, { error: error.message }));
    return;
  }
  if (request.url === '/api/me' && request.method === 'GET') {
    const session = getSession(request);
    if (!session) return jsonResponse(response, 401, { error: 'Sign in with Discord to continue.' });
    jsonResponse(response, 200, { user: publicUser(session.user), ...userDashboard(session.user.id) });
    return;
  }
  if (request.url === '/api/flight-plan' && request.method === 'POST') {
    const session = getSession(request);
    if (!session) return jsonResponse(response, 401, { error: 'Sign in with Discord to request a flight plan.' });
    readJson(request).then(async body => {
      const callsign = String(body.callsign || '').trim().toUpperCase();
      const aircraft = String(body.aircraft || '').trim();
      const departure = String(body.departure || '').trim().toUpperCase();
      const arrival = String(body.arrival || '').trim().toUpperCase();
      if (!callsign || !aircraft || !/^[A-Z]{4}$/.test(departure) || !/^[A-Z]{4}$/.test(arrival) || departure === arrival) throw new Error('Enter a callsign, aircraft, and two different four-letter ICAO airports.');
      const estimate = estimateFlight(departure, arrival, aircraft);
      const plan = { id: crypto.randomUUID(), userId: session.user.id, pilot: session.user.global_name || session.user.username, callsign, aircraft, departure, arrival, estimatedMinutes: estimate.minutes, distance: estimate.distance, status: 'pending', reason: '', createdAt: new Date().toISOString() };
      const channel = await client.channels.fetch(flightPlanChannelId);
      if (!channel?.isTextBased()) throw new Error('Configured flight-plan channel is unavailable.');
      const embed = new EmbedBuilder().setColor(0xC8170A).setTitle('New flight plan request').setDescription(`**${departure}**  →  **${arrival}**`).addFields(
        { name: 'Callsign', value: callsign, inline: true }, { name: 'Pilot', value: `${plan.pilot} (<@${plan.userId}>)`, inline: true }, { name: 'Aircraft', value: aircraft, inline: true },
        { name: 'Estimated flight time', value: formatDuration(estimate.minutes), inline: true }, { name: 'Route distance', value: estimate.distance ? `${estimate.distance.toLocaleString()} NM` : 'Standard estimate used', inline: true }, { name: 'Request ID', value: plan.id, inline: false }
      ).setFooter({ text: 'Submitted from AA Flight Ops website | Pending moderator review' }).setTimestamp();
      const controls = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`plan_accept:${plan.id}`).setLabel('Accept').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`plan_deny:${plan.id}`).setLabel('Deny with reason').setStyle(ButtonStyle.Danger));
      const message = await channel.send({ embeds: [embed], components: [controls] });
      plan.discordMessageId = message.id;
      flightData.plans.push(plan);
      saveFlightData();
      jsonResponse(response, 201, { message: 'Flight plan sent for moderator review.', estimatedTime: formatDuration(estimate.minutes), plan });
    }).catch(error => { console.error('Could not send website flight plan:', error.message); jsonResponse(response, 400, { error: error.message }); });
    return;
  }
  if (request.url === '/api/flight-plans' && request.method === 'GET') {
    const session = getSession(request);
    if (!session) return jsonResponse(response, 401, { error: 'Sign in with Discord to continue.' });
    jsonResponse(response, 200, userDashboard(session.user.id));
    return;
  }
  jsonResponse(response, 404, { error: 'Not found' });
});

flightPlanServer.listen(websiteApiPort, '127.0.0.1', () => console.log(`Website flight-plan API listening on port ${websiteApiPort}.`));

client.once('ready', async readyClient => {
  console.log(`Online as ${readyClient.user.tag}`);
  console.log(`AutoMod active: profanity filter and ${SPAM_LIMIT + 1} messages per ${SPAM_WINDOW_MS / 1000} seconds.`);
  for (const guild of readyClient.guilds.cache.values()) {
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageMessages)) {
      console.warn(`AutoMod cannot delete messages in ${guild.name}: grant the bot Manage Messages permission.`);
    }
  }
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commands });
    console.log('Global slash commands registered.');
  } catch (error) {
    console.error('Could not register slash commands:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isButton() && interaction.customId.startsWith('plan_')) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: 'Only moderators with Manage Messages can review flight plans.', ephemeral: true });
      return;
    }
    const [action, planId] = interaction.customId.split(':');
    const plan = flightData.plans.find(item => item.id === planId);
    if (!plan || plan.status !== 'pending') {
      await interaction.reply({ content: 'This flight plan has already been reviewed or no longer exists.', ephemeral: true });
      return;
    }
    if (action === 'plan_deny') {
      const modal = new ModalBuilder().setCustomId(`plan_deny_reason:${plan.id}`).setTitle('Deny flight plan');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setPlaceholder('Explain what the pilot should correct.')));
      await interaction.showModal(modal);
      return;
    }
    plan.status = 'accepted';
    plan.reviewedAt = new Date().toISOString();
    plan.reviewedBy = interaction.user.id;
    saveFlightData();
    await interaction.update({ content: `Accepted by ${interaction.user}.`, components: [], embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x20A36B).setFooter({ text: 'Accepted by a moderator' })] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('plan_deny_reason:')) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: 'Only moderators with Manage Messages can review flight plans.', ephemeral: true });
      return;
    }
    const planId = interaction.customId.split(':')[1];
    const plan = flightData.plans.find(item => item.id === planId);
    if (!plan || plan.status !== 'pending') {
      await interaction.reply({ content: 'This flight plan has already been reviewed or no longer exists.', ephemeral: true });
      return;
    }
    plan.status = 'denied';
    plan.reason = interaction.fields.getTextInputValue('reason').trim();
    plan.reviewedAt = new Date().toISOString();
    plan.reviewedBy = interaction.user.id;
    saveFlightData();
    await interaction.update({ content: `Denied by ${interaction.user}: ${plan.reason}`, components: [], embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x777F8F).addFields({ name: 'Denial reason', value: plan.reason }).setFooter({ text: 'Denied by a moderator' })] });
    return;
  }

  if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;

  if (interaction.commandName === 'logflight') {
    const departure = interaction.options.getString('departure_icao', true).toUpperCase();
    const arrival = interaction.options.getString('arrival_icao', true).toUpperCase();
    if (!/^[A-Z]{4}$/.test(departure) || !/^[A-Z]{4}$/.test(arrival)) {
      await interaction.reply({ content: 'Please enter valid four-letter ICAO codes.', ephemeral: true });
      return;
    }

    const hours = interaction.options.getInteger('hours', true);
    const minutes = interaction.options.getInteger('minutes', true);
    if (hours === 0 && minutes === 0) {
      await interaction.reply({ content: 'Flight time must be greater than zero.', ephemeral: true });
      return;
    }

    const aircraft = interaction.options.getString('aircraft', true);
    const image = interaction.options.getAttachment('flight_image', true);
    if (!image.contentType?.startsWith('image/')) {
      await interaction.reply({ content: 'The flight image must be an image file.', ephemeral: true });
      return;
    }
    const notes = interaction.options.getString('notes');
    const embed = new EmbedBuilder()
      .setColor(0xC8102E)
      .setTitle('Flight log')
      .setDescription(`**${departure}**  →  **${arrival}**`)
      .addFields(
        { name: 'Aircraft', value: aircraft, inline: true },
        { name: 'Flight time', value: `${hours}h ${String(minutes).padStart(2, '0')}m`, inline: true },
        { name: 'Pilot', value: interaction.user.toString(), inline: true }
      )
      .setTimestamp();
    if (notes) embed.addFields({ name: 'Notes', value: notes });
    embed.setImage(image.url);
    await interaction.reply({ embeds: [embed] });
    const estimate = estimateFlight(departure, arrival, aircraft);
    flightData.flights.push({ id: crypto.randomUUID(), userId: interaction.user.id, pilot: interaction.user.globalName || interaction.user.username, departure, arrival, aircraft, durationMinutes: hours * 60 + minutes, distance: estimate.distance, createdAt: new Date().toISOString(), source: 'discord' });
    saveFlightData();
    return;
  }

  if (interaction.commandName === 'faq') {
    await interaction.reply({
      content: 'The FAQ feature is under development and is not available yet.',
      ephemeral: true
    });
    return;
  }

  if (interaction.commandName === 'joinstaralliance') {
    await interaction.reply('https://discord.gg/Q8vppcNXAG');
    return;
  }

  if (interaction.commandName === 'claimroles') {
    if (interaction.guildId !== roleClaimGuildId) {
      await interaction.reply({ content: 'This command is only available in the configured server.', ephemeral: true });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: 'You need Manage Roles to use this command.', ephemeral: true });
      return;
    }

    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: 'The bot needs Manage Roles permission before it can assign roles.', ephemeral: true });
      return;
    }

    const assignableRoles = interaction.guild.roles.cache.filter(role =>
      !role.managed &&
      role.id !== interaction.guild.id &&
      role.position < botMember.roles.highest.position
    );
    if (assignableRoles.size === 0) {
      await interaction.reply({ content: 'There are no assignable roles below the bot’s highest role.', ephemeral: true });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const rolesToAdd = assignableRoles.filter(role => !member.roles.cache.has(role.id));
    if (rolesToAdd.size === 0) {
      await interaction.reply({ content: 'You already have every role the bot can assign.', ephemeral: true });
      return;
    }

    try {
      await member.roles.add(rolesToAdd);
      await interaction.reply({ content: `Assigned ${rolesToAdd.size} role${rolesToAdd.size === 1 ? '' : 's'} to you.`, ephemeral: true });
    } catch (error) {
      console.error(`Could not assign roles to ${interaction.user.tag}:`, error);
      await interaction.reply({ content: 'I could not assign all of those roles. Check the bot role hierarchy and permissions.', ephemeral: true });
    }
  }
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot || !message.member) return;

  const now = Date.now();
  const key = `${message.guild.id}:${message.author.id}`;
  const timestamps = (recentMessages.get(key) || []).filter(time => now - time < SPAM_WINDOW_MS);
  timestamps.push(now);
  recentMessages.set(key, timestamps);

  const hasProfanity = PROFANITY.test(message.content);
  const isSpam = timestamps.length > SPAM_LIMIT;
  if (!hasProfanity && !isSpam) return;

  const botMember = message.guild.members.me;
  const channelPermissions = botMember && message.channel.permissionsFor(botMember);
  if (!channelPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    console.warn(`AutoMod matched ${message.author.tag} in #${message.channel.name}, but the bot cannot manage messages there.`);
    return;
  }

  try {
    await message.delete();
    const reason = hasProfanity ? 'profanity' : 'spam';
    console.log(`AutoMod removed ${reason} from ${message.author.tag} in #${message.channel.name}.`);
    if (channelPermissions.has(PermissionFlagsBits.SendMessages)) {
      const warning = await message.channel.send({
        content: `${message.author}, please avoid ${reason === 'profanity' ? 'profanity' : 'spamming'}; your message was removed.`,
        allowedMentions: { users: [message.author.id] }
      });
      setTimeout(() => warning.delete().catch(() => {}), 6000);
    }
  } catch (error) {
    console.error('AutoMod could not remove a message. Check Manage Messages permission:', error.message);
  }
});

client.login(token);
