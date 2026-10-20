# MaloneX

Secure, self-hosted WhatsApp bot. One tenant per deployment.

## Deploy to Heroku

You can deploy your own instance of MaloneX directly to Heroku. The deploy button will automatically provision a Postgres database and prompt you for the required secrets.

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/brianmalone63/MaloneX-)

### Steps after deployment:
1. Open the **Heroku Dashboard** for your new app.
2. Go to **More** → **View logs**.
3. Wait for the `PAIRING CODE: XXXX-XXXX` to appear in the logs.
4. On your phone, open WhatsApp → **Linked Devices** → **Link with phone number instead**.
5. Enter the 8-digit code from the logs.
