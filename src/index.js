process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://ef2c055ac3c646d5850d3fa15203f997@sentry.cozycloud.cc/150'

const { BaseKonnector, scrape, log, utils } = require('cozy-konnector-libs')
const md5 = require('md5')

const VENDOR = 'Eau du Bassin Rennais'
const baseUrl = 'https://monespace.eaudubassinrennais.fr'

module.exports = new BaseKonnector(start)

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
// cozyParameters are static parameters, independents from the account. Most often, it can be a
// secret api key.
async function start(fields, cozyParameters) {
  log('info', 'Authenticating ...')
  if (cozyParameters) log('debug', 'Found COZY_PARAMETERS')
  const $ = await authenticate.bind(this)(fields.login, fields.password)
  log('info', 'Successfully logged in and got list of documents')
  log('info', 'Parsing list of documents')
  const documents = await parseDocuments($)

  log('info', 'Saving data to Cozy')
  await this.saveFiles(documents, fields)
}

// This shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
async function authenticate(username, password) {
  return this.signin({
    url: `${baseUrl}/wp/displayBills.action`,
    formSelector: '#form',
    formData: {
      j_username: username,
      password: '',
      j_password: md5(password)
    },
    // the validate function will check if
    validate: (statusCode, $) => {
      if ($(`table[id='billTable']`).length === 1) {
        return true
      } else {
        log('error', $('.alertmsg p').text().trim())
        return false
      }
    }
  })
}

// The goal of this function is to parse a HTML page wrapped by a cheerio instance
// and return an array of JS objects which will be saved to the cozy by saveFiles
// (https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#savefiles)
function parseDocuments($) {
  // You can find documentation about the scrape function here:
  // https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#scrape
  const docs = scrape(
    $,
    {
      date: {
        sel: 'td:nth-child(1)',
        parse: date =>
          new Date(date.replace(/^(\d+)\/(\d+)\/(\d+)$/, '$2/$1/$3'))
      },
      title: {
        sel: 'td:nth-child(2)'
      },
      // amount: {
      //   sel: 'td:nth-child(3)',
      //   parse: amount => parseFloat(amount)
      // },
      fileurl: {
        sel: 'a',
        attr: 'href',
        parse: href => `${baseUrl}/wp/${href}`
      }
    },
    'tbody tr'
  )
  return docs.map(doc => ({
    ...doc,
    // currency: 'EUR',
    filename: `${utils.formatDate(doc.date)}_Facture_${doc.title}.pdf`,
    vendor: VENDOR
  }))
}
