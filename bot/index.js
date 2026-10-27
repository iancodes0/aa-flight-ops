require('dotenv').config();
const http = require('http');

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const flightPlanChannelId = '1564726414731903106';
const websiteApiPort = Number(process.env.WEBSITE_API_PORT || 3001);
if (!token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and add your bot token.');
  process.exit(1);
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
    .setDescription('Get the Star Alliance Discord invite link.')
].map(command => command.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
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

function sendFlightPlanResponse(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  response.end(JSON.stringify(body));
}

const flightPlanServer = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    response.end();
    return;
  }
  if (request.method !== 'POST' || request.url !== '/api/flight-plan') {
    sendFlightPlanResponse(response, 404, { error: 'Not found' });
    return;
  }

  let rawBody = '';
  request.on('data', chunk => {
    rawBody += chunk;
    if (rawBody.length > 10000) request.destroy();
  });
  request.on('end', async () => {
    try {
      const body = JSON.parse(rawBody);
      const callsign = String(body.callsign || '').trim().toUpperCase();
      const aircraft = String(body.aircraft || '').trim();
      const departure = String(body.departure || '').trim().toUpperCase();
      const arrival = String(body.arrival || '').trim().toUpperCase();
      const pilot = String(body.pilot || '').trim();
      if (!callsign || !aircraft || !pilot || !/^[A-Z]{4}$/.test(departure) || !/^[A-Z]{4}$/.test(arrival) || departure === arrival) {
        sendFlightPlanResponse(response, 400, { error: 'Enter a callsign, pilot name, aircraft, and two different four-letter ICAO airports.' });
        return;
      }
      const estimate = estimateFlight(departure, arrival, aircraft);
      const channel = await client.channels.fetch(flightPlanChannelId);
      if (!channel?.isTextBased()) throw new Error('Configured flight-plan channel is unavailable.');
      const embed = new EmbedBuilder()
        .setColor(0xC8170A)
        .setTitle('New flight plan request')
        .setDescription(`**${departure}**  →  **${arrival}**`)
        .addFields(
          { name: 'Callsign', value: callsign, inline: true },
          { name: 'Pilot', value: pilot, inline: true },
          { name: 'Aircraft', value: aircraft, inline: true },
          { name: 'Departure ICAO', value: departure, inline: true },
          { name: 'Arrival ICAO', value: arrival, inline: true },
          { name: 'Estimated flight time', value: formatDuration(estimate.minutes), inline: true },
          { name: 'Route distance', value: estimate.distance ? `${estimate.distance.toLocaleString()} NM` : 'Airport distance unavailable; standard estimate used', inline: false }
        )
        .setFooter({ text: 'Submitted from AA Flight Ops website' })
        .setTimestamp();
      await channel.send({ embeds: [embed] });
      sendFlightPlanResponse(response, 201, { message: 'Flight plan sent to Discord.', estimatedTime: formatDuration(estimate.minutes) });
    } catch (error) {
      console.error('Could not send website flight plan:', error.message);
      sendFlightPlanResponse(response, 500, { error: 'The bot could not send the flight plan. Check its Discord channel permissions.' });
    }
  });
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
