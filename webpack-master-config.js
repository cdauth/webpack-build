'use strict';

var path = require('path');
var webpack = require('webpack');
var ProvidePlugin = require('webpack/lib/ProvidePlugin');
var DefinePlugin = require('webpack/lib/DefinePlugin');
var OccurenceOrderPlugin = require('webpack/lib/optimize/OccurenceOrderPlugin');
var DedupePlugin = require('webpack/lib/optimize/DedupePlugin');
var UglifyJsPlugin = require('webpack/lib/optimize/UglifyJsPlugin');
var CommonsChunkPlugin = require('webpack/lib/optimize/CommonsChunkPlugin');
var CopyWebpackPlugin = require('copy-webpack-plugin');
var HtmlWebpackPlugin = require('html-webpack-plugin');
var extend = require('node.extend');
var utils = require('./utils');
var fs = require('fs');

const ENV_DEVELOPMENT = 'development';
const ENV_PROD = 'production';

const CI_PARAM_DEV_MODE = '--devModeEnabled';
const CI_PARAM_DEBUG = '--debug';

/**
 * Module defining the common build configuration for webpack-based projects.
 *
 * @param opts Customized options which allows to override the defaults configuration.
 */
module.exports = function(opts) {

    let devModeEnabled = process.argv.indexOf(CI_PARAM_DEV_MODE) !== -1;
    let debugModeEnabled = process.argv.indexOf(CI_PARAM_DEBUG) !== -1;
    let outputPath = utils.getAbsolutePath('./../../../target/' + (opts.metadata.staticContentResourcesPrefix ? opts.metadata.staticContentResourcesPrefix : ''));
    let workingDir = utils.getAbsolutePath('./../../../');

    console.log('------------------------------------------------------------------------------------');
    if (devModeEnabled) {
        console.log('  Executing development build');
    } else {
        console.log('  Executing production build');
    }
    console.log('------------------------------------------------------------------------------------');

    console.log('Working dir: ' + workingDir);
    console.log('Output dir: ' + outputPath);

    let config = {

        metadata: {
            ENV: devModeEnabled ? ENV_DEVELOPMENT : ENV_PROD
        },
        devtool: 'source-map',
        debug: debugModeEnabled,

        entry: {},

        output: {
            path: outputPath,
            filename: '[name].[chunkhash].bundle.js',
            sourceMapFilename: '[name].[chunkhash].bundle.map',
            chunkFilename: '[id].[chunkhash].chunk.js'
        },

        resolve: {
            cache: false,
            extensions: ['', '.ts', '.js', '.json', '.css', '.html']
        },

        module: {
            preLoaders: [{
                test: /\.ts$/,
                loader: 'tslint-loader',
                exclude: [
                    /node_modules/
                ]
            }],
            loaders: [
                {
                    test: /\.ts$/,
                    loader: 'ts-loader',
                    query: {
                        // remove TypeScript helpers to be injected below by DefinePlugin
                        'compilerOptions': {
                            'removeComments': !devModeEnabled,
                            'noEmitHelpers': !devModeEnabled
                        },
                        'ignoreDiagnostics': [
                            2403, // 2403 -> Subsequent variable declarations
                            2300, // 2300 -> Duplicate identifier
                            2374, // 2374 -> Duplicate number index signature
                            2375  // 2375 -> Duplicate string index signature
                        ]
                    },
                    compilerOptions: './tsconfig.json',
                    exclude: [/\.(spec|e2e)\.ts$/]
                },

                {test: /\.json$/, loader: 'json-loader'},
                {test: /\.css$/, loader: 'raw-loader'},
                {test: /\.html$/, loader: 'raw-loader'}
            ]
        },

        plugins: getPlugins(devModeEnabled, opts),

        // Other module loader config
        tslint: {
            configuration: require('./tslint.config.json'),
            emitErrors: true,
            failOnHint: true
        },

        // don't use devServer for production
        devServer: {
            port: opts.metadata.devServer.port,
            host: opts.metadata.devServer.host,
            historyApiFallback: false,
            contentBase: outputPath,
            watchOptions: {
                aggregateTimeout: 300,
                poll: 1000
            }
        },

        // we need this due to problems with es6-shim
        node: {
            global: 'window',
            progress: false,
            crypto: 'empty',
            module: false,
            clearImmediate: false,
            setImmediate: false
        }
    };

    if (debugModeEnabled) {
        console.log(extend(true, config, opts));
        console.log('------------------------------------------------------------------------------------');
    }

    return extend(true, config, opts);
};

/**
 * Gets the list of plugins for the specific build run e.g. production.
 *
 * @param devModeEnabled Boolean if the development mode is enabled for the build
 * @param opts General configuration options
 */
function getPlugins(devModeEnabled, opts) {

    let plugins = [];
    let envMode = devModeEnabled ? ENV_DEVELOPMENT : ENV_PROD;

    // ---------------------------------------------------------- COMMON

    plugins.push(new webpack.DefinePlugin({
        'process.env': {
            'ENV': JSON.stringify(envMode),
            'NODE_ENV': JSON.stringify(envMode),
            'ADD_ON_KEY': JSON.stringify(opts.metadata.addOnKey)
        }
    }));
    plugins.push(new OccurenceOrderPlugin(true));
    if ('test' !== process.env.ENV) {
        plugins.push(new CommonsChunkPlugin({
            name: 'vendor',
            filename: 'vendor.[chunkhash].bundle.js',
            minChunks: Infinity
        }));
    }

    if (fs.existsSync('src/index.html')) {
        plugins.push(new HtmlWebpackPlugin({
            filename: 'index.html',     // output file (relative to output path)
            template: 'src/index.html', // input (template) file
            inject: false               // no automatic injection of assets
        }));
    }

    if (fs.existsSync('src/assets')) {
        plugins.push(new CopyWebpackPlugin([{
            from: 'src/assets',
            to: 'assets'
        }]));
    }

    // ---------------------------------------------------------- PROD

    if (!devModeEnabled) {

        plugins.push(new DedupePlugin());
        plugins.push(new ProvidePlugin({
            '__metadata': 'ts-helper/metadata',
            '__decorate': 'ts-helper/decorate',
            '__awaiter': 'ts-helper/awaiter',
            '__extends': 'ts-helper/extends',
            '__param': 'ts-helper/param',
            'Reflect': 'es7-reflect-metadata/dist/browser'
        }));
        plugins.push(new UglifyJsPlugin({
            mangle: false,
            comments: false,
            compress: {
                screw_ie8: true,
                warnings: false
            }
        }));
    }

    return plugins;
}