# server_monitor
a server monitor service that emails someone when a specified API endpoint is down

feel free to change the failure condition, i.e. (typeof data === 'object' && data !== null) to whatever your requirements are

requires: axios, nodemailer and dotenv

dotenv variables .env file:

CHECK_URLS="https://example1.com/rest|https://example2.com/rest"
EMAIL_TO="receiver@host.com"
EMAIL_FROM="sender@host.com"
SMTP_SERVER="smtp.example-mymail.com"
SMTP_PORT=465
SMTP_USER="sender@host.com"
SMTP_PASS="password"
