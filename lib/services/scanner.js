const fsaSingleton = require('../utils/fsa')
const { splitString } = require('../utils')
const { makeLegalIdentifier } = require('rollup-pluginutils')
const path = require('path')
const picomatch = require('picomatch')

const frontFiles = ['_layout', '_reset']
const extensions = ['svelte', 'html']

const defaultMeta = {
  bundle: false,
  recursive: true,
  'precache-order': false,
  'precache-proximity': true,
  preload: false,
}

// fsa=fsaSingleton for tests
module.exports = async function scanner({ pages, fsa = fsaSingleton, ignore }) {
  
  const tree = await getFileTree(pages, fsa, picomatch(ignore))
  const treeWithDirs = removeUnderscoredDirs(tree)
  const definedTree = defineFiles(treeWithDirs)
  const sortedTree = sortTree(definedTree)
  const treeWithMeta = await applyMetaToFiles(sortedTree, fsa)
  const treeWithAllMeta = applyMetaToTree(treeWithMeta)
  const svelteTree = removeNonSvelteFiles(treeWithAllMeta)
  const treeWithLayouts = applyLayouts(svelteTree)
  const list = flattenTree(treeWithLayouts)
  return list
}

/**
 * removeUnderscoredDirs
 * @param {String} tree
 */
function removeUnderscoredDirs(tree) {
  return tree.filter(file => {
    if (file.isDir) {
      if (file.name.match(/^_/)) return false
      else file.dir = removeUnderscoredDirs(file.dir)
    }
    return true
  })
}

/**
 * removeNonSvelteFiles
 * @param {String} tree
 */
function removeNonSvelteFiles(tree) {
  return tree.filter(file => {
    file.dir = removeNonSvelteFiles(file.dir)
    const isUnderscored = file.name.match(/^_/)
    const isPage = extensions.includes(file.ext) && !isUnderscored
    const isNormalDir = file.isDir && !isUnderscored
    return isPage || isNormalDir || file.isLayout || file.isFallback
  })
}

/**
 * applyLayouts
 * @param {Object} tree
 * @param {Array} layouts
 */
function applyLayouts(tree, layouts = []) {
  return tree.map(file => {
    if (file.isDir) file.dir = applyLayouts(file.dir, [...layouts])
    else {
      if (file.isReset || file.meta.reset) layouts = []
      if (file.isLayout) layouts.push(file)
      else file.layouts = layouts
    }
    return file
  })
}

/**
 * flattenTree
 * @param {Object} tree
 * @param {Array} arr
 */
function flattenTree(tree, arr = []) {
  tree.forEach(file => {
    if (!file.isDir) arr.push(file)
    else arr.push(...flattenTree(file.dir))
  })
  return arr
}

/**
 * applyMetaToFiles
 * @param {Object} tree
 * @param {Object} fsa
 * @param {Object} dirMeta
 */
async function applyMetaToFiles(tree, dirMeta = defaultMeta) {
  const treeWithMeta = tree.map(async file => {
    file.dir = await applyMetaToFiles(file.dir, { ...dirMeta })
    file.meta = file.isDir ? {} : await getMeta(file.absolutePath)
    return file
  })
  return Promise.all(treeWithMeta)
}

function applyMetaToTree(tree, dirMeta = defaultMeta) {
  return tree.map(file => {
    file.dir = applyMetaToTree(file.dir, { ...dirMeta })
    mergeMeta(file, dirMeta)
    return file
  })
}

/**
 * mergeMeta
 * @param {Object} meta
 * @param {Object} dirMeta
 * @param {Boolean} isLayout
 * @param {String} filepath
 */
function mergeMeta({ meta, filepath, isLayout }, dirMeta) {
  const inheritedOption = [
    '$preload',
    '$precache-order',
    '$precache-proximity',
    '$recursive',
    '$$bundleId',
  ]

  inheritedOption.forEach(prop => {
    meta[prop] = meta[prop] || dirMeta[prop]
    if (isLayout) {
      dirMeta[prop] = meta[prop]
    }
  })

  if (meta.$bundle === false) {
    delete meta.$$bundleId
    if (!isLayout) delete dirMeta.$$bundleId
  } else {
    if (meta.$bundle === true) {
      if (!isLayout) throw Error('only layouts can bundle')
      dirMeta.$$bundleId = makeLegalIdentifier(filepath) + '.js'
    }
    meta.$$bundleId = dirMeta.$$bundleId
  }
}

/**
 * sortTree
 * @param {Object} tree
 */
function sortTree(tree) {
  const sortedFiles = tree.sort(file => (file.isLayout ? -1 : 1))
  const sortedTree = sortedFiles.map(file => ({
    ...file,
    dir: file.isDir ? sortTree(file.dir) : file.dir,
  }))
  return sortedTree
}

/**
 * defineFiles
 * @param {Object} tree
 */
function defineFiles(tree) {
  return tree.map(file => {
    file.isLayout = frontFiles.includes(file.name)
    file.isReset = ['_reset'].includes(file.name)
    file.isIndex = ['index'].includes(file.name)
    file.isFallback = ['_fallback'].includes(file.name)
    file.hasParam = file.name.match(/^\[.+\]$/) ? true : false
    file.dir = file.isDir ? defineFiles(file.dir) : file.dir
    return file
  })
}

/**
 * getFileTree
 * @param {String} absoluteDir
 * @param {Object} fsa
 * @param {String} relativeDir
 */
async function getFileTree(absoluteDir, fsa, isIgnored, relativeDir = '') {
  const files = await fsa.readdir(absoluteDir)
  const promises = files.map(async filename => {
    const absolutePath = path.resolve(absoluteDir, filename)
    const isDir = await isDirectory(absolutePath, fsa)
    const [name, ext] = splitString(filename, ".")
    const filepath = `${relativeDir}/${filename}`

    const file = {
      file: filename,
      filepath,
      name,
      ext,
      isDir,
      relativeDir,
      absolutePath
    }

    file.dir = isAcceptedDir(file, isIgnored)
      ? await getFileTree(absolutePath, fsa, isIgnored, filepath)
      : []
    return file
  })
  return Promise.all(promises)
}

async function isDirectory(file, fsa) {
  const stat = await fsa.stat(file)
  return stat.isDirectory()
}

function isAcceptedDir({ name, isDir, filepath }, isIgnored) {
  const isUnderscored = name.match(/^_/)
  return isDir && !isUnderscored && !isIgnored(filepath)
}

/**
 * TODO
 * @param {String} filepath
 * @param {String} filename
 * @param {Array} files
 */
function getMeta(filepath, filename, files) {
  // console.log('filename', filename)
  // console.log('filepath', filepath)
  // console.log('files', files)
  return getMetaFromComments(filepath)
}

/**
 * getMetaFromComments
 * @param {String} file
 */
async function getMetaFromComments(file) {
  const meta = {}
  const content = await fsaSingleton.readFile(file, 'utf8')
  const matchedContent = content.match(
    /\<\!\-\- *routify:option *(.+?) *\-\-\>/m
  )
  if (matchedContent) {
    const rawMeta = matchedContent[1].match(/[^ ]+=[^ ]+/g)
    rawMeta.forEach(rawOption => {
      const [prop, value] = rawOption.match(/(.+)=(.+)/).slice(1)
      meta[prop] = eval(value)
    })
  }
  return meta
}
