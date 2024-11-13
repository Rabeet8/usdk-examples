import React from 'react';
import {
  Action,
  Agent,
  PendingActionEvent,
  TTS,
  useCalendarKeysJson,
} from 'react-agents';
import { z } from 'zod';

//

// integrating the Google Calendar API

interface CalendarEvent {
  summary: string;
  description: string;
  start: { dateTime: string };
  end: { dateTime: string };
}

class GoogleCalendarManager {
  private readonly GOOGLE_CALENDAR_ID: string;
  private readonly GOOGLE_API_KEY: string;
  private readonly GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  private readonly GOOGLE_PRIVATE_KEY: string;
  constructor({
    GOOGLE_CALENDAR_ID,
    GOOGLE_API_KEY,
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY
  }: {
    GOOGLE_CALENDAR_ID: string,
    GOOGLE_API_KEY: string,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: string,
    GOOGLE_PRIVATE_KEY: string
  }) {
    this.GOOGLE_CALENDAR_ID = GOOGLE_CALENDAR_ID;
    this.GOOGLE_API_KEY = GOOGLE_API_KEY;
    this.GOOGLE_SERVICE_ACCOUNT_EMAIL = GOOGLE_SERVICE_ACCOUNT_EMAIL;
    this.GOOGLE_PRIVATE_KEY = GOOGLE_PRIVATE_KEY;
  }
  private async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // Token valid for 1 hour
    const jwtHeader = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const jwtClaimSet = btoa(JSON.stringify({
      iss: this.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: 'https://oauth2.googleapis.com/token',
      exp: expiry,
      iat: now,
    }));
    const signatureInput = `${jwtHeader}.${jwtClaimSet}`;
    const signature = await this.signJwt(signatureInput);
    const jwt = `${signatureInput}.${signature}`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  }
  private async signJwt(input: string): Promise<string> {
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = this.GOOGLE_PRIVATE_KEY.substring(
      this.GOOGLE_PRIVATE_KEY.indexOf(pemHeader) + pemHeader.length,
      this.GOOGLE_PRIVATE_KEY.indexOf(pemFooter)
    ).replace(/\s/g, '');
    const binaryDer = this.base64StringToArrayBuffer(pemContents);
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );
    const encoder = new TextEncoder();
    const signatureBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      encoder.encode(input)
    );
    const signatureArray = new Uint8Array(signatureBuffer);
    return btoa(String.fromCharCode.apply(null, signatureArray))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
  private base64StringToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
  async setCalendarEvent(event: CalendarEvent): Promise<string> {
    console.log('Creating event:', event);
    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${this.GOOGLE_CALENDAR_ID}/events?key=${this.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );
    console.log(response);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create event: ${errorText}`);
    }
    const result = await response.json();
    console.log('Event created:', result);
    return `Event created: ${result.htmlLink}`;
  }
}

const PersonalAssistant = () => {
  // get credentials from wrangler.toml
  const calendarKeysJson = useCalendarKeysJson();

  const googleCalendarManager = new GoogleCalendarManager({
    GOOGLE_CALENDAR_ID: calendarKeysJson.GOOGLE_CALENDAR_ID,
    GOOGLE_API_KEY: calendarKeysJson.GOOGLE_API_KEY,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: calendarKeysJson.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY: calendarKeysJson.GOOGLE_PRIVATE_KEY,
  });


  return (
    <>
      <Action
        name="setCalendarEvent"
        description="Sets a new event in the user's Google Calendar."
        schema={
          // update according to https://developers.google.com/calendar/api/v3/reference/events
          z.object({
            summary: z.string(),
            startDateTime: z.string(),
            endDateTime: z.string(),
            description: z.string(),
          })}
        examples={[
          {
            summary: 'Meeting with John Doe',
            startDateTime: "2023-06-15T10:00:00-07:00",
            endDateTime: "2023-06-15T11:00:00-07:00",
            description: 'Discuss the project timeline and requirements.',
          },
        ]}
        handler={async (e: PendingActionEvent) => {
          const { summary, description, startDateTime, endDateTime } = e.data.message.args as {
            summary: string;
            description: string;
            startDateTime: string;
            endDateTime: string;
          };
          const event = {
            summary,
            description,
            start: { dateTime: startDateTime },
            end: { dateTime: endDateTime },
          };

          await googleCalendarManager.setCalendarEvent(event);

        }}
      />
    </>
  )
}

export default function MyAgent() {
  return (
    <Agent /* */ >
      {/* <TTS voiceEndpoint="elevenlabs:uni:PSAakCTPE63lB4tP9iNQ" /> */}
      <PersonalAssistant />
    </Agent>
  );
}
