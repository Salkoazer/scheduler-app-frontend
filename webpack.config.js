const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development', // Set the mode to 'development' or 'production'
    entry: './src/index.tsx', // Specify the entry point of your application
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
        publicPath: '/' // Ensure that all routes are handled correctly
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html', // Ensure the correct path to your index.html
        }),
        new Dotenv({ systemvars: true }), // Load .env and pass through real process env vars (Amplify build)
        // Define env vars explicitly for the browser bundle
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
            'process.env.REACT_APP_API_BASE_URL': JSON.stringify(process.env.REACT_APP_API_BASE_URL || ''),
            'process.env.API_BASE_URL': JSON.stringify(process.env.API_BASE_URL || ''),
            // Expose Amplify-provided git metadata (if present) for debugging
            'process.env.AWS_COMMIT_ID': JSON.stringify(process.env.AWS_COMMIT_ID || ''),
            'process.env.AWS_BRANCH': JSON.stringify(process.env.AWS_BRANCH || ''),
            '__APP_API_BASE__': JSON.stringify(process.env.REACT_APP_API_BASE_URL || process.env.API_BASE_URL || '')
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'public/favicon.svg', to: 'favicon.svg' }
            ]
        })
    ],
    devServer: {
        static: {
            directory: path.join(__dirname, 'public'), // Serve static files from the public directory
        },
        compress: true,
        port: 9000,
        historyApiFallback: true, // Ensure that the server serves index.html for all routes
        proxy: {
            '/api': 'http://localhost:3000' // Proxy API requests to the backend server (avoid CORS in dev)
        }
    }
};