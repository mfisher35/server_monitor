const axios = require('axios');
const nodemailer = require('nodemailer');
require('dotenv').config();
const fs = require('fs');


const CHECK_URLS = process.env.CHECK_URLS ? process.env.CHECK_URLS.split(',') : [];
const CHECK_INTERVAL = 15 * 60 * 1000; // N minutes
const ALERT_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

// Track last alert timestamp for each URL
let lastAlertTimestamps = {};
let downCount = {};


const chargers = [ 
   {
     'url':`https://api.gridspot.co/rest/charger_statuses?api_key=${process.env.CHARGER_STATUS_API_KEY}`,
     'cids': ["1001"], //,"1013"]
    },
]


const transporter = nodemailer.createTransport({
    host: process.env.SMTP_SERVER,
    port: process.env.SMTP_PORT,
    secure: true, // using SSL
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function checkValidator() {
   const now = Date.now();
   var bData = [];
   const unixTimestamp = Math.floor(Date.now() / 1000);
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
          // Check if 4 hours have passed since the last alert for this URL
          if (!lastAlertTimestamps["miniserver"] || (now - lastAlertTimestamps["miniserver"] >= ALERT_INTERVAL)) {
            sendAlertEmail("miniserver", "Blocks Out of Sync!");
            lastAlertTimestamps["miniserver"] = now;
          } else {
	    //console.log(`⚠️ Alert already sent for mini in the last 4 hours. Skipping email.`);
          }

       }
       else if (Math.abs(unixTimestamp-myTimestamp)/60 > 10) {
           // Check if 4 hours have passed since the last alert for this URL
           if (!lastAlertTimestamps["miniserver"] || (now - lastAlertTimestamps["miniserver"] >= ALERT_INTERVAL)) {
             sendAlertEmail("miniserver", "Timestamp Expired!");
             lastAlertTimestamps["miniserver"] = now;
           } else {
            //console.log(`⚠️ Alert already sent for mini in the last 4 hours. Skipping email.`);
        }

       }
   });

}

async function checkChargers() {
    let url = ""
    let chargerId = "";
    let errorCids = [];

    try {
      for (const charger of chargers) {

        url = charger['url']
        const response = await axios.get(url, { timeout: 10000 }); // 10s timeout
        const data = response.data;
        charger['cids'].forEach(cid =>{
              if (!data[cid] || data[cid] == "Faulted") {
		  errorCids.push(cid);
              }
           })
      }		   

       if (errorCids.length > 0)
          throw new Error(`Chargers ${errorCids.join(",")} are Offine!`);

    } catch (error) {
        //console.error(`❌ Server check failed: ${url} - ${error.message}`);
        const now = Date.now();
        const code = url+errorCids.join(',');
        downCount[code] = downCount[code] ? downCount[code] + 1 : 1
        // Check if 4 hours have passed since the last alert for this cid
        if (!lastAlertTimestamps[code] || now - lastAlertTimestamps[code] >= ALERT_INTERVAL) {
            sendAlertEmail(url.split("?")[0], error.message,"Charger");
            lastAlertTimestamps[code] = now;
	    downCount[code] = 0
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
        downCount[url] = downCount[url] ? downCount[url] + 1 : 1;
        // Check if the url is down more than once and 4 hours have passed since the last alert for this URL
        if (downCount[url] > 1 && (!lastAlertTimestamps[url] || now - lastAlertTimestamps[url] >= ALERT_INTERVAL)) {
	    downCount[url] = 0;
            sendAlertEmail(url, error.message);
            lastAlertTimestamps[url] = now;
        } else {
            //console.log(`⚠️ Alert already sent for ${url} in the last 4 hours. Skipping email.`);
        }
    }
}

function sendAlertEmail(url, errorMsg, type="Server") {
    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,
        subject: `🚨 ${type} Down Alert: ${url}`,
        text: `The ${type} with ${url} is down.\nError: ${errorMsg}`
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error(`Error sending email for ${url}:`, error);
        } else {
            //console.log(`📧 Alert email sent for ${url}:`, info.response);
        }
    });
}

// Run checks every n minutes for each URL
function runChecks() {
    CHECK_URLS.forEach(checkServer);
    checkValidator();
    checkChargers();
}

// Start checking immediately and every n minutes
setInterval(runChecks, CHECK_INTERVAL);
console.log("Monitor Service Started.");
