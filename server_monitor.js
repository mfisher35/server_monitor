const axios = require('axios');
const nodemailer = require('nodemailer');
require('dotenv').config();
const fs = require('fs');


const CHECK_URLS = process.env.CHECK_URLS ? process.env.CHECK_URLS.split('|') : [];
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const ALERT_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

// Track last alert timestamp for each URL
let lastAlertTimestamps = {};

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_SERVER,
    port: process.env.SMTP_PORT,
    secure: true, // using SSL
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

function checkValidator() {
   var bData = [];
   const unixTimestamp = Math.floor(Date.now() / 1000);
   try {
      fs.readFile('/usr/share/nginx/html/mini/current.txt', 'utf8', (err, data) => {
         if (err) {
            console.error('Error reading file:', err);
            return;
         }
      bData = data.trim().split(" ");	     
      officialBlock = parseInt(bData[0]);
      myBlock = parseInt(bData[1]);
      myTimestamp = parseInt(bData[2]);

      if (myBlock < officialBlock) {
            throw new Error('Mini server block age out of sync!');
        }
      else if (Math.abs(unixTimestamp-myTimestamp)/60 > 10) {
            throw new Error('Mini server timed out! (10 minutes+)');
        }
      });

    } catch (error) {

        console.log(error)
        //console.error(`❌ Server check failed: ${url} - ${error.message}`);
        const now = Date.now();

        // Check if 4 hours have passed since the last alert for this URL
        if (!lastAlertTimestamps["miniserver"] || now - lastAlertTimestamps["miniserver"] >= ALERT_INTERVAL) {
            sendAlertEmail("miniserver", error.message);
            lastAlertTimestamps["miniserver"] = now;
        } else {
            //console.log(`⚠️ Alert already sent for ${url} in the last 4 hours. Skipping email.`);
        }
    }
}


async function checkServer(url) {
    try {
        const response = await axios.get(url, { timeout: 10000 }); // 10s timeout
        const data = response.data;

        if (typeof data === 'object' && data !== null && data['status'] == "online") {
            //console.log(`✅ Server is up: ${url}`);
        } else {
            throw new Error('Invalid response format');
        }
    } catch (error) {
        //console.error(`❌ Server check failed: ${url} - ${error.message}`);
        const now = Date.now();

        // Check if 4 hours have passed since the last alert for this URL
        if (!lastAlertTimestamps[url] || now - lastAlertTimestamps[url] >= ALERT_INTERVAL) {
            sendAlertEmail(url, error.message);
            lastAlertTimestamps[url] = now;
        } else {
            //console.log(`⚠️ Alert already sent for ${url} in the last 4 hours. Skipping email.`);
        }
    }
}

function sendAlertEmail(url, errorMsg) {
    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,
        subject: `🚨 Server Down Alert: ${url}`,
        text: `The server at ${url} is down.\nError: ${errorMsg}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error(`Error sending email for ${url}:`, error);
        } else {
            //console.log(`📧 Alert email sent for ${url}:`, info.response);
        }
    });
}

// Run checks every 5 minutes for each URL
function runChecks() {
    CHECK_URLS.forEach(checkServer);
    checkValidator();
}

// Start checking immediately and every 5 minutes
//setInterval(runChecks, CHECK_INTERVAL);
runChecks();
checkValidator();
console.log("Monitor Service Started.");
