module.exports.sanitizeOptions = function(defaultOptions, inputOptions) {
  const options = {}
  Object.keys(defaultOptions).forEach(key => {
    options[key] = key in inputOptions ? inputOptions[key] : defaultOptions[key]
  })
  return options
}

module.exports.asyncForEach = async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

module.exports.splitString = function splitString(str, delimiter) {
  const pos = str.lastIndexOf(delimiter)
  if (pos === -1) return [str, null]
  return [str.substr(0, pos), str.substr(pos + 1)]
}

module.exports.filepathToUrl = path => {
  path = this.stripExtension(path)
  return path.replace(/\[([^\]]+)\]/g, ':$1')
}

module.exports.stripExtension = str => str.replace(/\.[^\.]+$/, '')

const MATCH_BRACKETS = RegExp(/\[[^\[\]]+\]/g)
module.exports.pathToRegex = (str, recursive) => {
  const suffix = recursive ? '' : '/?$' //fallbacks should match recursively
  str = str.replace(/\/_fallback?$/, '(/|$)')
  str = str.replace(/\/index$/, '(/index)?') //index files should be matched even if not present in url
  str = '^' + str.replace(MATCH_BRACKETS, '([^/]+)') + suffix
  return str
}

module.exports.pathToParams = string => {
  const matches = string.match(MATCH_BRACKETS)
  if (matches) return matches.map(str => str.substr(1, str.length - 2))
}

module.exports.pathToRank = ({ path }) => {
  return path
    .split('/').filter(Boolean)
    .map(str => (str === '_fallback' ? 'A' : str.startsWith(':') ? 'B' : 'C'))
    .join('')
}

module.exports.serializeRoute = (route, keys) => {
  return keys.map(key => route[key])
}
