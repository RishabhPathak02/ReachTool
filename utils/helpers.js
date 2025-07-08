const axios = require('axios');

async function safeApiCall(url, retries = 3, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url);
    } catch (err) {
      const msg = err.response?.data?.error?.message?.toLowerCase() || "";
      if (msg.includes("rate limit") && i < retries - 1) {
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

function formatNumber(num) {
  return num >= 1e6 ? (num / 1e6).toFixed(2) + "M" :
         num >= 1e3 ? (num / 1e3).toFixed(1) + "K" :
         num.toString();
}

function formatReach(value) {
  if (value < 1000) return Math.round(value).toString();
  if (value < 1e6) return (value / 1e3).toFixed(1) + "K";
  return (value / 1e6).toFixed(2) + "M";
}

module.exports = { safeApiCall, formatNumber, formatReach };