//REQUIRES
const express = require('express');
require('dotenv').config();//put the variables in the .env file into process.env
const cors = require('cors');
const { connect } = require("./db");
const { ObjectId } = require('mongodb');

//SETUP EXPRESS
const app = express();
app.use(cors()); //enable cors for API
app.use(express.json()); // tell express that we are sending and receiving data in json

//SETUP DATABASE
const mongoUri = process.env.MONGO_URI;
const dbName = "recipecatalogue";

async function validateRecipe(db, request) {
    const { name, cuisine, prepTime, cookTime, servings, ingredients, instructions, tags } = request;

    // basic validation
    if (!name || !cuisine || !ingredients || !instructions || !tags || !prepTime || !cookTime || !servings) {
        return {
            "success": false,
            "error": "Missing fields",
        }
    }

    // validate the cuisine
    const cuisineDoc = await db.collection('cuisines').findOne({
        name: cuisine
    });

    if (!cuisineDoc) {
        return {
            "success": false,
            "error": "Invalid cuisine"
        }
    }

    // validate the tags

    // find the tags from the database
    const tagDocs = await db.collection('tags').find({
        "name": {
            $in: tags
        }
    }).toArray();

    // check if the number of tags that we have found matches the length of the tags array
    if (tagDocs.length != tags.length) {
        return {
            success: false,
            error: "One or more tags is invalid"
        }
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

    return {
        success: true,
        newRecipe: newRecipe,
        error: null
    }

}

async function main() {
    const db = await connect(mongoUri, dbName);

    //ROUTES
    app.get('/test', function (req, res) {
        res.json({
            "message": "hello world"
        })
    });

    // app.get with search query, regex
    app.get('/recipes', async function (req, res) {
        console.log(req.query);
        const name = req.query.name;
        const tags = req.query.tags;
        const ingredients = req.query.ingredients;
        // when criteria is empty, it returns everything
        const criteria = {};
        if (name) {
            // search by string patterns using regex
            criteria["name"] = {
                $regex: name,
                $options: "i"
            }
        }

        if (tags) {
            criteria["tags.name"] = {
                $in: tags.split(",")
            }
        }

        // simple search - must be exact match and is case sensitive
        // if (ingredients) {
        //     critera["ingredients.name"] = {
        //         $all: ingredients.split(",")
        //     }
        // }
        // advanced search: use $all with regular expressions

        if (ingredients) {
            // traditional way of using for...loop
            // const ingredientArray = ingredients.split(",");
            // const regularExpressionArray = [];
            // for (let ingredient of ingredientArray) {
            //     regularExpressionArray.push(new RegExp(ingredient, 'i'));
            // }

            // modern way: use .map
            // const ingredientArray = ingredients.split(",");
            // const regularExpressionArray = ingredientArray.map(function(ingredient){
            //     return new RegExp(ingredient, 'i')
            // })

            // using arrow function:
            const regularExpressionArray = ingredients.split(",").map(
                ingredient => new RegExp(ingredient, "i")
            );

            criteria['ingredients.name'] = {
                $all: regularExpressionArray
            }
        }

        console.log(criteria);
        const recipes = await db.collection('recipes').find(criteria).project({
            name: 1, cuisine: 1, tags: 1, prepTime: 1
        }).toArray();
        res.json({
            "recipes": recipes
        })
    })
    /* Old app.get('/recipes', async function (req, res) {
        const recipes = await db.collection('recipes').find().project({
            name: 1, cuisine: 1, tags: 1, prepTime: 1
        }).toArray();
        res.json({
            "recipes": recipes
        })
    }); */

    app.post('/recipes', async function (req, res) {
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
            _id: new ObjectId(),
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

    app.put('/recipes/:id', async function (req, res) {
        const recipeId = req.params.id;
        const status = await validateRecipe(db, req.body);
        if (status.success) {
            //update the recipe
            const result = await db.collection('recipes').updateOne({
                _id: new ObjectId(recipeId)
            }, {
                $set: status.newRecipe
            });
            res.json({
                'message': "Recipe has been successfully updated"
            })
        } else {
            res.status(400).json({
                error: status.error
            })
        }
    })

    app.delete('/recipes/:id', async function (req, res) {
        try {
            const recipeId = req.params.id;
            await db.collection('recipes').deleteOne({
                _id: new ObjectId(recipeId)
            });

            if (results.deletedCount === 0) {
                return res.status(404).json({
                    "error": "not found"
                })
            }

            res.json({
                "message": "deleted successfully"
            })
        } catch (e) {
            res.status(500).json({
                'error': "internal server error"
            })
        }
    })
}

main();


//START SERVER
app.listen(3000, function () {
    console.log("Server has started");
})