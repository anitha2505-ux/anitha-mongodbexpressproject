//REQUIRES
const express = require('express');
require('dotenv').config();//put the variables in the .env file into process.env
const cors = require('cors');
const { connect } = require("./db");
const { objectId } = require('mongodb');

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
    app.get('/test', function (req, res) {
        res.json({
            "message": "hello world"
        })
    });

    app.get('/recipes', async function (req, res) {
        const recipes = await db.collection('recipes').find().project({
            name: 1, cuisine: 1, tags: 1, prepTime: 1
        }).toArray();
        res.json({
            "recipes": recipes
        })
    });

    app.post('/receipes', async function (req, res) {
        //syntaxic sugar
        //object destructring to extract info from req.body
        const { name, cuisine, prepTime, cookTime, servings, ingredients, instructions, tags } = req.body;

        //basic validation
        if (!name || !cuisine || !prepTime || !cookTime || !servings || !ingredients || !instructions || !tags) {
            return res.status(400).json({
                error: "Missing required fields"
            })
        }

        // validate cuisine
        const cuisineDoc = await db.collection('cuisines').findOne({
            name: cuisine
        });

        if (!cuisineDoc) {
            return res.status(400).json({
                error: "Cuisine not found"
            })
        }

        // validate tags

        // find the tags from the database
        const tagDocs = await db.collection('tags').find({
            "name": {
                $in: tags
            }
        }).toArray();

        // check if the number of tags in the array matches the database

        if (tagDocs.length != tags.length) {
            return res.status(400).json({
                'error': "one or more tags is invalid"
            })
        }

        const newRecipe = {
            name,
            cuisine: {
                _id: cuisineDoc._id,
                name: cuisineDoc.name
            },
            prepTime,
            cookTime,
            servings,
            ingredients,
            instructions,
            tags: tagDocs
        }

        const result = await db.collection('recipes').insertOne(newRecipe);
        res.status(201).json({
            message: "Recipe Added",
            recipeId: result.insertedId
        })
    })
}

main();


//START SERVER
app.listen(3000, function () {
    console.log("Server has started");
})