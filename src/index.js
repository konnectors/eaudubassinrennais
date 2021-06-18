process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://ef2c055ac3c646d5850d3fa15203f997@sentry.cozycloud.cc/150'

const {
  BaseKonnector,
  requestFactory,
  scrape,
  log,
  utils
} = require('cozy-konnector-libs')
const md5 = require('md5')
const request = requestFactory({
  // The debug mode shows all the details about HTTP requests and responses. Very useful for
  // debugging but very verbose. This is why it is commented out by default
  // debug: true,
  // Activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: true,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: false,
  // This allows request-promise to keep cookies between requests
  jar: true
})

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
  await authenticate.bind(this)(fields.login, fields.password)
  log('info', 'Successfully logged in')
  // The BaseKonnector instance expects a Promise as return of the function
  log('info', 'Fetching the list of documents')
  const $ = await request(`${baseUrl}/wp/displayBills.action`)
  // cheerio (https://cheerio.js.org/) uses the same api as jQuery (http://jquery.com/)
  log('info', 'Parsing list of documents')
  const documents = await parseDocuments($)

  // Here we use the saveBills function even if what we fetch are not bills,
  // but this is the most common case in connectors
  log('info', 'Saving data to Cozy')
  await this.saveBills(documents, fields, {
    // This is a bank identifier which will be used to link bills to bank operations. These
    // identifiers should be at least a word found in the title of a bank operation related to this
    // bill. It is not case sensitive.
    identifiers: ['eau du bassin nnais']
  })
}

// This shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
async function authenticate(username, password) {
  const $ = await request(`${baseUrl}/wp/displayBills.action`, {
    resolveWithFullResponse: true
  })

  return this.signin({
    url: baseUrl,
    formSelector: '#form',
    formData: {
      j_username: username,
      password: '',
      j_password: md5(password)
    },
    headers: {
      Cookie: $.headers['set-cookie'][0]
    },
    // the validate function will check if
    validate: (statusCode, $) => {
      if ($(`a[href='/wp/logout.external']`).length === 1) {
        return true
      } else {
        log(
          'error',
          $('.alertmsg p')
            .text()
            .trim()
        )
        return false
      }
    }
  })
}

// The goal of this function is to parse a HTML page wrapped by a cheerio instance
// and return an array of JS objects which will be saved to the cozy by saveBills
// (https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#savebills)
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
      amount: {
        sel: 'td:nth-child(3)',
        parse: amount => parseFloat(amount)
      },
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
    currency: 'EUR',
    filename: `${utils.formatDate(doc.date)}_Facture_${doc.title}.pdf`,
    vendor: VENDOR
  }))
}
