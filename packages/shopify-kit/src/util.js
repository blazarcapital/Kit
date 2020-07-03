const fetch = require('node-fetch')

function shopifyApiRequest(method, url, body, settings) {
  return fetch(`https://${settings.store}${url}`, {
    method,
    headers: {
      'X-Shopify-Access-Token': settings.password,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  }).then((response) => {
    return response.json()
  })
}

async function getTheme() {
  shopifyApiRequest('GET', `/themes/${settings.theme}.json`)
}

async function isProductionTheme(settings) {
  const response = await shopifyApiRequest(
    'GET',
    `/themes/${settings.theme}.json`,
    false,
    settings
  )

  if (!response || !response.theme || !response.theme.role) {
    throw new Error('Could not get theme info from Shopify')
  }

  return response.theme.role === 'main'
}

module.exports = {
  shopifyApiRequest,
  getTheme,
  isProductionTheme
}
