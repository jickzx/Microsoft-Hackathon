
interface DiscordInvite {
  guild?: {
    id: string;
    name: string;
  };
}

interface DiscordUser {
  id: string;
}

export async function joinDiscordServer(inviteCode: string, userAccessToken?: string) {
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken || !userAccessToken) {
    console.warn("Discord credentials or user token missing");
    return { success: false, error: "Discord credentials or user token missing" };
  }

  try {
    // 1. Get Guild ID from Invite Code
    const inviteResponse = await fetch(`https://discord.com/api/v10/invites/${inviteCode}`, {
      headers: { Authorization: `Bot ${botToken}` }
    });

    if (!inviteResponse.ok) {
      throw new Error(`Failed to fetch invite info: ${inviteResponse.statusText}`);
    }

    const inviteData = (await inviteResponse.json()) as DiscordInvite;
    const guildId = inviteData.guild?.id;
    const guildName = inviteData.guild?.name;

    if (!guildId || !guildName) {
      throw new Error("Could not find guild info from invite");
    }

    // 2. Get User ID from Access Token
    const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${userAccessToken}` }
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to fetch user info: ${userResponse.statusText}`);
    }

    const userData = (await userResponse.json()) as DiscordUser;
    const userId = userData.id;

    // 3. Add User to Guild
    const joinResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        access_token: userAccessToken
      })
    });

    if (joinResponse.status === 201) {
      console.log(`Successfully joined Discord server: ${guildName}`);
      return { success: true, guildName };
    } else if (joinResponse.status === 204) {
      console.log(`User already in Discord server: ${guildName}`);
      return { success: true, guildName, alreadyMember: true };
    } else {
      const errorData = await joinResponse.json();
      throw new Error(`Failed to join guild: ${JSON.stringify(errorData)}`);
    }
  } catch (error) {
    console.error("Discord join error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
