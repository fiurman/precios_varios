// Metro no conoce los workspaces de npm: sin esto no encuentra @precios/*
// ni las dependencias izadas a la raiz del monorepo.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Que no busque hacia arriba por su cuenta: con el monorepo termina
// resolviendo dos copias de react y la app explota en runtime.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
