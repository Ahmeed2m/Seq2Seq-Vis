const path = require('path');
const DefinePlugin = require('webpack').DefinePlugin;
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const package = require('./package.json');

module.exports = (env) => ({
    entry: './ts/main.ts',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [{
                    loader: 'cache-loader'
                },
                {
                    loader: 'thread-loader',
                    options: {
                        // there should be 1 cpu for the fork-ts-checker-webpack-plugin
                        workers: require('os').cpus().length - 1,
                    },
                },
                {
                    loader: 'ts-loader',
                    options: {
                        happyPackMode: true // IMPORTANT! use happyPackMode mode to speed-up  compilation and reduce errors reported to webpack
                    }
                }
                ].slice(process.env.CI ? 2 : 0) // no optimizations for CIs
            },
            {
                test: /\.s?css$/,
                use: ExtractTextPlugin.extract({
                    fallback: 'style-loader',
                    use: [
                        {
                            loader: 'css-loader',
                            options: {
                                //minimize: true,
                                sourceMap: true
                            }
                        },
                        {
                            loader: 'sass-loader',
                            options: {
                                sourceMap: true
                            }
                        }
                    ]
                    })
            },
            {
                test: /\.(png|jpg)$/,
                loader: 'url-loader',
                options: {
                    limit: 20000 //inline <= 10kb
                }
            },
            {
                test: /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: 'url-loader',
                options: {
                    limit: 20000, //inline <= 20kb
                    mimetype: 'application/font-woff'
                }
            },
            {
                test: /\.svg(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: 'url-loader',
                options: {
                    limit: 10000, //inline <= 10kb
                    mimetype: 'image/svg+xml'
                }
            },
            {
                test: /\.(ttf|eot)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: 'file-loader'
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    plugins: [
        new DefinePlugin({
            __VERSION__: JSON.stringify(package.version),
            __BUILDID__: JSON.stringify(new Date().toISOString())
        }),
        new ExtractTextPlugin('style.css'),
        new ForkTsCheckerWebpackPlugin({
          checkSyntacticErrors: true
        })
    ],
    optimization: {
        splitChunks: {
            cacheGroups: {
                vendor: {
                    test: /node_modules/,
                    chunks: "initial",
                    name: "vendor",
                    priority: 10,
                    enforce: true
                }
            }
        }
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, '../client_dist/')
    },
    devServer: {
        port: 8090,
        proxy: {
            '/api/*': {
                target: 'http://localhost:8080',
                secure: false,
                ws: true
            }
        }
    }
});
