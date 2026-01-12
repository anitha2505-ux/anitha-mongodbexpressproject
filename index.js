//REQUIRES
const express = require('express');
require('dotenv').config();//put the variables in the .env file into process.env
const cors = require('cors');
const { connect } = require("./db");
const { ObjectId } = require('mongodb');
const { ai, generateSearchParams, generateRecipe } = require('./gemini');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { verifyToken } = require("./middlewares")

//SETUP EXPRESS
const app = express();
app.use(cors()); //enable cors for API
app.use(express.json()); // tell express that we are sending and receiving data in json

//SETUP DATABASE
const mongoUri = process.env.MONGO_URI;
const dbName = "recipecatalogue";

function generateAccessToken(id, email) {
    // jwt.sign creates a JWT
    // first parameter -> object payload, or token data, the data that is in the JWT (i.e "claims")
    // second parameter -> your secret key
    // third parameter -> options object
    return jwt.sign({
        "user_id": id,
        "email": email
    }, process.env.TOKEN_SECRET, {
        // m = minutes, h = hours, s = seconds, d = days, w = weeks
        "expiresIn": "1h"
    });
}

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
    //query string parameter
    // name of the recipe 
    // tag - example: popular, spicy
    // example: 
    // ?name=chicken&tags=popular,spicy&ingredients=chicken
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

    // use the route parameter `recipeId` to refer to the recipe we want
    app.get("/recipes/:recipeId", async function (req, res) {
        const recipeId = req.params.recipeId;
        const recipe = await db.collection("recipes").findOne({
            _id: new ObjectId(recipeId)
        })
        res.json({
            recipe
        });
    })

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
            const results = await db.collection('recipes').deleteOne({
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

    app.get('/ai/recipes', async function (req, res) {
        const query = req.query.q;

        const allCuisines = await db.collection('cuisines').distinct('name');
        const allTags = await db.collection('tags').distinct('name');
        const allIngredients = await db.collection('ingredients').distinct('name');
        const searchParams = await generateSearchParams(query, allTags, allCuisines, allIngredients);
        console.log(searchParams);

        const criteria = {};

        if (searchParams.cuisines && searchParams.cuisines.length > 0) {
            criteria["cuisine.name"] = {
                $in: searchParams.cuisines
            }
        }

        if (searchParams.ingredients && searchParams.ingredients.length > 0) {
            criteria["ingredients.name"] = {
                $all: searchParams.ingredients
            }
        }

        if (searchParams.tags && searchParams.tags.length > 0) {
            criteria['tags.name'] = {
                $in: searchParams.tags
            }
        }

        console.log(criteria);

        const recipes = await db.collection('recipes').find(criteria).toArray();
        res.json({
            recipes
        })
    })
    app.post('/ai/recipes', async function (req, res) {
        const recipeText = req.body.recipeText;
        const allCuisines = await db.collection('cuisines').distinct('name');
        const allTags = await db.collection('tags').distinct('name');
        const newRecipe = await generateRecipe(recipeText, allCuisines, allTags);

        // get the cuisine document
        const cuisineDoc = await db.collection('cuisines').findOne({
            "name": newRecipe.cuisine
        });

        if (cuisineDoc) {
            newRecipe.cuisine = cuisineDoc;
        } else {
            return res.status(404).json({
                "error": "AI tried to use a cuisine that doesn't exist"
            })
        }

        // get all the tags that corresponds 
        const tagDocs = await db.collection('tags').find({
            'name': {
                $in: newRecipe.tags
            }
        }).toArray();
        newRecipe.tags = tagDocs;

        // insert into the database
        const result = await db.collection('recipes').insertOne(newRecipe);
        res.json({
            recipeId: result.insertedId
        })
    })

    // register router
    // sample request body
    // {
    //    "email":"sarah@gemail.com",
    //    "password": "pw123"
    // }
    app.post('/users', async function (req, res) {
        const result = await db.collection('users')
            .insertOne({
                "email": req.body.email,
                "password": await bcrypt.hash(req.body.password, 12)
            });

        res.json({
            message: "New user has been create has been created successfully",
            userId: result.insertedId
        })
    })

    // sample POST body
    // {
    //   "email":"tanahkow@gemail.com",
    //   "password":"rotiprata123"
    // }
    app.post('/login', async function (req, res) {
        const { email, password } = req.body;
        const user = await db.collection("users").findOne({
            "email": email
        });

        // compare takes in two parameters
        // first parameter: plain text
        // second parameter: hashed version
        // return true if they are the same
        if (user) {
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (isPasswordValid) {
                // generate JWT
                const accessToken = generateAccessToken(user._id, user.email)

                // send back JWT
                res.json({
                    accessToken
                })
            } else {
                return res.status(401).json({
                    'error': 'Invalid login'
                })
            }
        } else {
            return res.status(401).json({
                'error': 'Invalid login'
            })
        }

    })

    // The access token will be in the request's header, in the Authorization field
    // the format will be "Bearer <JWT>"
    app.get('/protected', [verifyToken], function (req, res) {
        const tokenData = req.tokenData; // added by the verifyToken middleware
        res.json({
            "message": "This is a secret message",
            tokenData
        })

    })
}


main();


//START SERVER
app.listen(3000, function () {
    console.log("Server has started");
})