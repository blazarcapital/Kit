const fs = require('fs-extra')
const output = require('@halfhelix/terminal-kit')
const { shopifyApiRequest } = require('./util')

module.exports = function init(settings, args = {}) {
  /**
   * filled on each sync request, emptied when successful
   */
  let queue = []
  let errors = []
  let successes = []

  function upload(token) {
    // Caters to a super weird nuance of the asset API
    // Where attempting to update Shopify Plus checkout template
    // using "attachment" returns success but does nothing
    const isCheckout = token.theme === 'layout/checkout.liquid'
    const encoded = isCheckout
      ? typeof token.content !== 'undefined'
        ? token.content
        : fs.readFileSync(token.original, 'utf-8')
      : typeof token.content !== 'undefined'
      ? Buffer.from(token.content, 'utf-8').toString('base64')
      : Buffer.from(fs.readFileSync(token.original), 'utf-8').toString('base64')

    return shopifyApiRequest(
      'PUT',
      `/themes/${settings.theme}/assets.json`,
      {
        asset: {
          key: token.theme,
          [isCheckout ? 'value' : 'attachment']: encoded
        }
      },
      settings
    )
      .then(({ errors: error, asset }) => {
        if (error) {
          errors.push({ token, error })
        } else {
          successes.push({ token, asset })
        }
        return Promise.resolve(true)
      })
      .catch((error) => {
        errors.push({ token, error })
      })
  }

  function enqueue(action, cb) {
    return new Promise(async (resolve, reject) => {
      ;(function push(token) {
        if (!token) resolve()

        Promise.all([
          new Promise((resolve) => {
            setTimeout(() => resolve(), 500)
          }),
          action(token)
        ])
          .then(() => {
            cb && cb(queue.length, token)
            if (queue.length) return push(queue.pop())
            resolve()
          })
          .catch((error) => {
            cb && cb(queue.length, token)
            if (queue.length) return push(queue.pop())
            reject(error)
          })
      })(queue.pop())
    })
  }

  function filterOutIgnored(paths) {
    return paths.filter((path) => !~settings.ignore.indexOf(path.theme))
  }

  function handleErrors() {
    errors.forEach(({ error, token }) => {
      const messages = Object.keys(error).reduce((array, key) => {
        array.push(
          `[${token.theme}] ` +
            (typeof error[key] === 'string'
              ? error[key]
              : error[key].join(', '))
        )
        return array
      }, [])
      output.uploadErrors(messages)
      return true
    })
  }

  function sync(paths = [], shouldUpdateThemeName = false) {
    queue = filterOutIgnored(paths)
    ;(errors = []), (successes = [])

    if (!queue.length) {
      return Promise.resolve(false)
    }

    if (queue.length === 1) {
      var spinner = output.action(
        `${args.label || 'Uploading'} "${paths[0].theme}"`
      )
      var cb = function () {}
    } else {
      var spinner = false
      var cb = (function () {
        const total = queue.length
        const update = output.progressBar(
          'Uploading',
          total,
          settings.isCI() || settings['debug.showDeploymentLog']
        )
        return (remaining, token) => {
          update(
            total - remaining,
            {
              errors: errors.length
            },
            token
          )
        }
      })()
    }

    return enqueue(upload, cb).then(() => {
      if (errors.length) {
        spinner && spinner.fail()
        handleErrors()
        !spinner && output.completedAction('Upload completed')
        return Promise.resolve(false)
      } else {
        spinner && spinner.succeed()
        return Promise.resolve(true)
      }
    })
  }

  return {
    sync
  }
}
