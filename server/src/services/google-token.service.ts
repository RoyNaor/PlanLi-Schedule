import { CalendarIntegrationService } from "./calendar-integration.service.js";
import { GoogleCalendarClient } from "./google-calendar.client.js";

const TOKEN_REFRESH_BUFFER_MS = 60_000;

export const GoogleTokenService = {
  async getValidAccessToken(userId: string): Promise<string> {
    const integration = await CalendarIntegrationService.getGoogleIntegrationByUserId(userId);
    if (!integration) {
      throw new Error("Google Calendar is not connected for this user");
    }

    const shouldRefresh =
      Date.now() + TOKEN_REFRESH_BUFFER_MS >= integration.accessTokenExpiresAt.getTime();

    if (!shouldRefresh) {
      return integration.accessToken;
    }

    const refreshed = await GoogleCalendarClient.refreshAccessToken({
      refreshToken: integration.refreshToken,
    });

    await CalendarIntegrationService.updateAccessToken({
      userId,
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: refreshed.expiresAt,
    });

    return refreshed.accessToken;
  },

  async withValidAccessToken<T>(
    userId: string,
    work: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const accessToken = await this.getValidAccessToken(userId);
    return work(accessToken);
  },
};
