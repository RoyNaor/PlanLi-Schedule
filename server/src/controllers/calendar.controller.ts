import type { Request, Response } from "express";
import { isIsoDateString } from "../utils/schedule-date.utils.js";
import { GoogleOAuthService } from "../services/google-oauth.service.js";
import { CalendarIntegrationService } from "../services/calendar-integration.service.js";
import { CalendarSyncService } from "../services/calendar-sync.service.js";
import { ScheduleService } from "../services/schedule.service.js";

function callbackSuccessHtml() {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>PlanLi Calendar Connected</title></head>
  <body>
    <p>Google Calendar connected. You can close this window.</p>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: "planli:calendar-connected" }, "*");
      }
      window.close();
    </script>
  </body>
</html>`;
}

export const calendarController = {
  async connectGoogle(req: Request, res: Response) {
    try {
      if (!req.authUser?.uid) {
        return res.status(401).json({ error: "Missing authenticated user" });
      }

      const authUrl = GoogleOAuthService.buildAuthorizationUrl({
        userId: req.authUser.uid,
      });

      return res.status(200).json({ auth_url: authUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create OAuth URL";
      return res.status(400).json({ error: message });
    }
  },

  async googleCallback(req: Request, res: Response) {
    try {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code || !state) {
        return res.status(400).send("Missing OAuth callback parameters");
      }

      const { userId } = GoogleOAuthService.verifyOAuthState(state);
      const tokens = await GoogleOAuthService.exchangeCodeForTokens({ code });
      const existing = await CalendarIntegrationService.getGoogleIntegrationByUserId(userId);
      const refreshToken = tokens.refreshToken ?? existing?.refreshToken ?? null;
      if (!refreshToken) {
        throw new Error("Missing refresh token after OAuth exchange");
      }

      await CalendarIntegrationService.upsertGoogleTokens({
        userId,
        accessToken: tokens.accessToken,
        refreshToken,
        accessTokenExpiresAt: tokens.expiresAt,
      });
      await CalendarSyncService.ensureWebcalToken(userId);
      await CalendarSyncService.registerWatchChannel(userId);

      return res.status(200).type("html").send(callbackSuccessHtml());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed OAuth callback";
      console.error("Calendar OAuth callback error:", error);
      return res.status(400).send(message);
    }
  },

  async getStatus(req: Request, res: Response) {
    try {
      if (!req.authUser?.uid) {
        return res.status(401).json({ error: "Missing authenticated user" });
      }
      const status = await CalendarSyncService.getConnectionStatus(req.authUser.uid);
      return res.status(200).json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load calendar status";
      return res.status(500).json({ error: message });
    }
  },

  async syncOutbound(req: Request, res: Response) {
    try {
      if (!req.authUser?.uid) {
        return res.status(401).json({ error: "Missing authenticated user" });
      }

      const weekStart = typeof req.body?.week_start === "string" ? req.body.week_start : "";
      if (!isIsoDateString(weekStart)) {
        return res.status(400).json({ error: "week_start must be YYYY-MM-DD" });
      }

      const published = await ScheduleService.getPublishedScheduleForUser({
        weekStart,
        userId: req.authUser.uid,
      });
      if (!published) {
        return res.status(404).json({ error: "No published schedule for this week" });
      }

      await CalendarSyncService.syncPublishedVersion(published.version.id);
      return res.status(200).json({ synced: true, version_id: published.version.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed outbound sync";
      return res.status(500).json({ error: message });
    }
  },

  async receiveWebhook(req: Request, res: Response) {
    try {
      const channelId = req.header("x-goog-channel-id") ?? "";
      const resourceId = req.header("x-goog-resource-id") ?? "";
      const resourceState = req.header("x-goog-resource-state") ?? "";

      if (!channelId || !resourceId) {
        return res.status(400).json({ error: "Missing webhook headers" });
      }

      await CalendarSyncService.handleWebhook({
        channelId,
        resourceId,
        resourceState,
      });

      return res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook handling failed";
      console.error("Google webhook handling error:", error);
      return res.status(400).json({ error: message });
    }
  },

  async getWebcalFeed(req: Request, res: Response) {
    try {
      const token = typeof req.params.token === "string" ? req.params.token : "";
      if (!token.trim()) {
        return res.status(400).send("Missing feed token");
      }

      const feed = await CalendarSyncService.buildIcsFeedForToken(token);
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Cache-Control", "s-maxage=900");
      return res.status(200).send(feed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to build calendar feed";
      return res.status(404).send(message);
    }
  },

  async rotateFeedToken(req: Request, res: Response) {
    try {
      if (!req.authUser?.uid) {
        return res.status(401).json({ error: "Missing authenticated user" });
      }

      const token = await CalendarIntegrationService.rotateWebcalToken(req.authUser.uid);
      return res.status(200).json({
        token_rotated: true,
        webcal_url: `${process.env.WEBCAL_BASE_URL?.replace(/\/+$/, "")}/api/calendar/feed/${token}.ics`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to rotate token";
      return res.status(500).json({ error: message });
    }
  },

  async disconnect(req: Request, res: Response) {
    try {
      if (!req.authUser?.uid) {
        return res.status(401).json({ error: "Missing authenticated user" });
      }

      await CalendarSyncService.disconnectUser(req.authUser.uid);
      return res.status(200).json({ disconnected: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to disconnect";
      return res.status(500).json({ error: message });
    }
  },
};
