//REQUIRES
const express = require('express');
require('dotenv').config();//put the variables in the .env file into process.env
const cors = require('cors');
const {connect} = require("./db");


//SETUP EXPRESS
const app = express();
app.use(cors()); //enable cors for API
app.use(express.json()); // tell express that we are sending and receiving data in json

//SETUP DATABASE
const mongoUri = process.env.MONGO_URI;
const dbName = "recipecatalogue";

async function main() {
    const db = await connect(mongoUri, dbName);

    //ROUTES
app.get('/test', function(req,res){
    res.json({
        "message": "hello world"
    })
});

app.get('/recipes', async function(req,res){
    const recipes = await db.collection('recipes').find().project({
        name: 1, cuisine: 1, tags: 1, prepTime: 1
    }).toArray();
    res.json({
        "recipes": recipes
    })
})
}

main();


//START SERVER
app.listen(3000, function(){
    console.log("Server has started");
})