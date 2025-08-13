const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');

module.exports = {
    mode: 'development', // Set the mode to 'development' or 'production'
    entry: './src/index.tsx', // Specify the entry point of your application
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
        publicPath: '/' // Ensure that all routes are handled correctly
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        fallback: {
            "crypto": require.resolve("crypto-browserify"),
            "buffer": require.resolve("buffer/"),
            "stream": require.resolve("stream-browserify"),
            "vm": require.resolve("vm-browserify")
        }
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
        new Dotenv() // Add dotenv-webpack plugin
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