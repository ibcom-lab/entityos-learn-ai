/*
	SELFDRIVEN AI API;
	https://slfdrvn.io/apps#apis

	AI Util Functions
	See Spec Doc @
	node_modules/aifactory/

	ai-gen-get-models
	ai-gen-get-agents
	ai-gen-chat
	ai-gen-conversation-chat

	Depends on;
	https://learn.entityos.cloud/learn-function-automation

	---

	This is a lambda compliant node app with a wrapper to process data from API Gateway & respond to it.

	To run it on your local computer your need to install
	https://www.npmjs.com/package/lambda-local and then run as:

	lambda-local -l index.js -t 9000 -e event.json

	API Gateway docs:
	- https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
	
	Authentication:
	Get apikey in the event data, and using user in settings.json get the username based on matching GUID
	The use the authKey in the event data as the password with the username.
	!! In production make sure the settings.json is unrestricted data with functional restriction to setup_user
	!!! The apiKey user has restricted data (based on relationships) and functional access

	Event Data:
	{
	  "body": {
	    "apikey": "e7849d3a-d8a3-49c7-8b27-70b85047e0f1"
	  },
	  "queryStringParameters": {},
	  "headers": {}
	}

	event/passed data available via request contect in the app scope.
	eg
		var request = entityos.get(
		{
			scope: 'app',
			context: 'request'
		});
		
		>

		{ 
			body: {},
			queryString: {},
			headers: {}
		}

	"app-auth" checks the apikey sent against users in the space (as per settings.json)
	
	Run:
	lambda-local -l index-api.js -t 9000 -e event-api-ai-gen-get-models-lab.json
	lambda-local -l index-api.js -t 9000 -e event-api-ai-gen-chat-openai-lab.json
	lambda-local -l index-api.js -t 9000 -e event-api-ai-gen-chat-claude-lab.json
	lambda-local -l index-api.js -t 9000 -e event-api-ai-gen-chat-aws-lab.json

	lambda-local -l index-api.js -t 9000 -e event-api-ai-gen-chat-openai-all-lab.json
	
	Upload to AWS Lambda:
	zip -r ../entityos-ai-DDMMMYYYY.zip *
*/

exports.handler = function (event, context, callback)
{
	var entityos = require('entityos');
	var _ = require('lodash')
	var moment = require('moment');
	//var entityosProtect = require('entityos/entityos.protect.js');

	entityos._util.message(event)

	if (event.isBase64Encoded)
	{
		event.body = Buffer.from(event.body, 'base64').toString('utf-8');
	}

	console.log(event)

	if (_.isString(event.body))
	{
		if (_.startsWith(event.body, 'ey'))
		{
			event.body = JSON.parse(Buffer.from(event.body, 'base64').toString('utf-8'));
		}
		else
		{
			event.body = JSON.parse(event.body);
		}
	}

	if (_.isString(event.body.data))
	{
		if (_.startsWith(event.body.data, 'ey'))
		{
			event.body.data = JSON.parse(Buffer.from(event.body, 'base64').toString('utf-8'));
		}
		else
		{
			event.body.data = JSON.parse(event.body.data);
		}
	}

	if (_.has(event, 'body._context'))
	{
		event.context = event.body._context;
	}

	if (event.context == undefined && _.has(event, 'body.data._context'))
	{
		event.context = event.body.data._context;
	}

	entityos.set(
	{
		scope: '_event',
		value: event
	});

	entityos.set(
	{
		scope: '_context',
		value: context
	});

	entityos.set(
	{
		scope: '_data',
		value: event.body.data
	});

	/*
		Use promise to responded to API Gateway once all the processing has been completed.
	*/

	const promise = new Promise(function(resolve, reject)
	{	
		entityos.init(main);

		function main(err, data)
		{
			/*
				app initialises with entityos.invoke('app-init') after controllers added.
			*/

			entityos.add(
			{
				name: 'app-init',
				code: function ()
				{
					entityos._util.message('Using entityos module version ' + entityos.VERSION);
					entityos._util.message(entityos.data.session);

					var eventData = entityos.get(
					{
						scope: '_event'
					});

					var request =
					{ 
						body: {},
						queryString: {},
						headers: {}
					}

					//back it also work with direct data input ie called as function.

					if (eventData != undefined)
					{
						request.queryString = eventData.queryStringParameters;
						request.headers = eventData.headers;

						if (_.isString(eventData.body))
						{
							request.body = JSON.parse(eventData.body)
						}
						else
						{
							request.body = eventData.body;
						}	
					}

					if (request.headers['x-api-key'] != undefined)
					{
						var _xAPIKey = _.split(request.headers['x-api-key'], '|');
						
						if (_xAPIKey.length == 0)
						{
							entityos.invoke('util-end', {error: 'Bad x-api-key in header [' + request.headers['x-api-key'] + '] - it should be {apiKey} or {apiKey}|{authKey}.'}, '401');
						}
						else
						{
							if (_xAPIKey.length == 1)
							{
								request.body.apikey = _xAPIKey[0];
							}
							else
							{
								request.body.apikey = _xAPIKey[0];
								request.body.authkey = _xAPIKey[1];
							}
						}
					}

					if (request.headers['x-auth-key'] != undefined)
					{
						request.body.authkey = request.headers['x-auth-key'];
					}

					entityos.set(
					{
						scope: '_request',
						value: request
					});

					if (request.body.apikey != undefined)
					{
						if (request.body.authkey != undefined)
						{
							entityos.invoke('app-auth');
						}
						else
						{
							if (_.includes(['ai-gen-get-models', 'ai-gen-chat'], request.body.method))
							{
								entityos.invoke('app-start');
							}
							else
							{
								entityos.invoke('util-end', {error: 'Missing authKey'}, '401');
							}
						}
					}
					else
					{
						if (_.includes(['ai-gen-get-models', 'ai-gen-chat'], request.body.method))
						{
							entityos.invoke('app-start');
						}
						else
						{
							entityos.invoke('util-end', {error: 'Missing apiKey'}, '401');
						}
					}
				}
			});

			entityos.add(
			{
				name: 'app-auth',
				code: function (param)
				{
					var request = entityos.get(
					{
						scope: '_request'
					});

					var requestApiKeyGUID = request.body.apikey;

					entityos.cloud.search(
					{
						object: 'setup_user',
						fields: [{name: 'username'}],
						filters:
						[
							{
								field: 'guid',
								comparison: 'EQUAL_TO',
								value: requestApiKeyGUID
							}
						],
						callback: 'app-auth-process'
					});
				}
			});

			entityos.add(
			{
				name: 'app-auth-process',
				code: function (param, response)
				{
					entityos.set(
					{
						scope: 'app',
						context: 'user',
						value: response
					});

					if (response.status == 'ER')
					{
						entityos.invoke('util-end', {error: 'Error processing user authentication.'}, '401');
					}
					else
					{
						if (response.data.rows.length == 0)
						{
							var request = entityos.get(
							{
								scope: '_request'
							});

							var requestApiKeyGUID = request.body.apikey;

							entityos.invoke('util-end', {error: 'Bad apikey [' + requestApiKeyGUID + ']'}, '401');
						}
						else
						{
							var user = _.first(response.data.rows);

							var request = entityos.get(
							{
								scope: '_request'
							});

							var requestAuthKeyGUID = request.body.authkey;

							entityos.logon('app-auth-logon-process',
							{
								logon: user.username,
								password: requestAuthKeyGUID
							});
						}
					}
				}
			});

			entityos.add(
			{
				name: 'app-auth-logon-process',
				code: function (response)
				{
					if (response.status == 'ER')
					{
						var request = entityos.get(
						{
							scope: '_request'
						});

						var requestAuthKeyGUID = request.body.authkey;

						if (response.error.errornotes == 'LogonKey has not been requested')
						{
							entityos.invoke('util-end', {error: 'Bad authkey user config. Set authenticationlevel=1. [' + requestAuthKeyGUID + ']'}, '401');
						}
						else
						{
							entityos.invoke('util-end', {error: 'Bad authkey [' + requestAuthKeyGUID + ']'}, '401');
						}
					}
					else
					{
						entityos.set(
						{
							scope: 'app',
							context: 'user',
							value: response
						});

						entityos.invoke('app-user');
					}
				}
			});

			entityos.add(
			{
				name: 'app-user',
				code: function (param)
				{
					entityos.cloud.invoke(
					{
						method: 'core_get_user_details',
						callback: 'app-user-process'
					});
				}
			});

			entityos.add(
			{
				name: 'app-user-process',
				code: function (param, response)
				{
					entityos.set(
					{
						scope: 'app',
						context: 'user',
						value: response
					})

					entityos.invoke('app-start')
				}
			});

			entityos.add(
			{
				name: 'util-uuid',
				code: function (param)
				{
					var pattern = entityos._util.param.get(param, 'pattern', {"default": 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'}).value;
					var scope = entityos._util.param.get(param, 'scope').value;
					var context = entityos._util.param.get(param, 'context').value;

					var uuid = pattern.replace(/[xy]/g, function(c) {
						    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
						    return v.toString(16);
						  });

					entityos.set(
					{
						scope: scope,
						context: context,
						value: uuid
					})
				}
			});

			entityos.add(
			{
				name: 'app-log',
				code: function ()
				{
					var eventData = entityos.get(
					{
						scope: '_event'
					});

					entityos.cloud.invoke(
					{
						object: 'core_debug_log',
						fields:
						{
							data: JSON.stringify(eventData),
							notes: 'app Log (Event)'
						}
					});

					var requestData = entityos.get(
					{
						scope: 'app',
						context: 'request'
					});

					entityos.cloud.invoke(
					{
						object: 'core_debug_log',
						fields:
						{
							data: JSON.stringify(requestData),
							notes: 'app Log (Request)'
						}
					});

					var contextData = entityos.get(
					{
						scope: '_context'
					});

					entityos.cloud.invoke(
					{
						object: 'core_debug_log',
						fields:
						{
							data: JSON.stringify(contextData),
							notes: 'appLog (Context)'
						},
						callback: 'app-log-saved'
					});
				}
			});

			entityos.add(
			{
				name: 'app-log-saved',
				code: function (param, response)
				{
					entityos._util.message('Log data saved to entityos.cloud');
					entityos._util.message(param);
					entityos._util.message(response);
				
					entityos.invoke('app-respond')
				}
			});

			entityos.add(
			{
				name: 'app-respond',
				code: function (param)
				{
					var response = entityos.get(
					{
						scope: 'app',
						context: 'response'
					});

					var statusCode = response.httpStatus;
					if (statusCode == undefined) {statusCode = '200'}

					var body = response.data;
					if (body == undefined) {body = {}}
					
					var headers = response.headers;
					if (headers == undefined) {headers = {}}

					let httpResponse =
					{
						statusCode: statusCode,
						headers: headers,
						body: JSON.stringify(body)
					};

					resolve(httpResponse)
				}
			});

			entityos.add(
			{
				name: 'util-end',
				code: function (data, statusCode, headers)
				{
					if (statusCode == undefined) { statusCode = '200' }
					if (headers == undefined) { headers = {'Content-Type': 'application/json'} }

					entityos.set(
					{
						scope: 'app',
						context: 'response',
						value:
						{
							data: data,
							statusCode: statusCode,
							headers: headers
						}
					});

					entityos.invoke('app-respond')
				}
			});

			entityos.add(
			{
				name: 'app-start',
				code: function ()
				{
					var request = entityos.get(
					{
						scope: '_request'
					});

					var data = request.body;
					var mode = data.mode;
					var method = data.method;

					if (_.isString(mode))
					{
						mode = {type: mode, status: 'OK'}
					}

					if (mode == undefined)
					{
						mode = {type: 'live', status: 'OK'}
					}

					if (mode.status == undefined)
					{
						mode.status = 'OK';
					}

					mode.status = mode.status.toUpperCase();

					if (mode.type == 'reflect')
					{
						var response = {}

						if (mode.data != undefined)
						{
							response.data = mode.data;
						}
						
						entityos.invoke('util-uuid',
						{
							scope: 'guid',
							context: 'log'
						});

						entityos.invoke('util-uuid',
						{
							scope: 'guid',
							context: 'audit'
						});

						response.data = _.assign(response.data,
						{
							status: mode.status,
							method: method,
							reflected: data,
							guids: entityos.get(
							{
								scope: 'guid'
							})
						});

						entityos.set(
						{
							scope: 'app',
							context: 'response',
							value: response
						});

						entityos.invoke('app-respond');
					}
					else
					{
						entityos.invoke('app-process');
					}
				}
			});

			//-- METHODS

			entityos.add(
			{
				name: 'app-process',
				code: function ()
				{
					var request = entityos.get({scope: '_request'});

					var data = request.body;
				
					var method = data.method;
	
					if (_.includes(
					[
						'ai-gen-get-models',
						'ai-gen-chat',
						'ai-gen-conversation-chat'
					],
						method))
					{
						var settings = entityos.get({scope: '_settings'});

						const aifactoryNamespace = _.get(settings, 'ai.defaults.namespace', 'util.ai.gpt-1.0.0');

						const aifactory = require('aifactory/aifactory.' + aifactoryNamespace + '.js');

						if (_.has(aifactory, 'init'))
						{
							aifactory.init();
						}

						var aifactoryNamespaces = _.get(settings, 'ai.default.namespaces');
			
						if (aifactoryNamespaces != undefined)
						{
							var _namespaces = {};
							_.each(aifactoryNamespaces, function (namespace)
							{
								entityos._util.message(namespace);

								_namespaces[namespace] = require('aifactory/aifactory.' + namespace + '.js');

								if (_.has(_namespaces[namespace], 'init'))
								{
									_namespaces[namespace].init();
								}
							});
						}

						const aiSettings = entityos.invoke('ai-gen-util-get-settings');

						const namespaceDefault = _.get(settings, 'ai.defaults.namespace');
						const namespace = _.get(aiSettings, 'service.namespace', namespaceDefault);
						
						if (namespace != undefined)
						{
							const servicefactory = require('aifactory/aifactory.' + namespace + '.js');

							if (_.has(servicefactory, 'init'))
							{
								servicefactory.init();
							}
						}

						entityos.invoke('app-process-' + method)
					}
					else
					{
						entityos.set(
						{
							scope: 'app',
							context: 'response',
							value:
							{
								status: 'ER',
								data: {error: {code: '2', description: 'Not a valid method [' + method + ']'}}
							}
						});

						entityos.invoke('app-respond');
					}
				}
			});

			entityos.add(
			{
				name: 'app-process-ai-gen-get-models',
				code: function ()
				{
					var data = entityos.get({scope: '_data'});

					if (data == undefined)
					{
						entityos.invoke('util-end', 
						{
							error: 'Missing data.'
						},
						'403');
					}
					else
					{
						const settings = entityos.get(
						{
							scope: '_settings'
						});

						let models = [];

						if (_.has(settings, 'ai.services'))
						{
							_.each(settings.ai.services, function (service)
							{
								_.each(service.models, function (model)
								{
									model._data = 
									{
										name: model.name,
										service: service.name
									}

									if (model.default)
									{
										model._data.default = true;
									}

									if (model.usage != undefined)
									{
										model._data.usage =model.usage;
									}

									models.push(
										model._data
									);
								});
							})
						}

						let usage = {}

						if (_.has(settings, 'ai.usage.rules'))
						{
							usage.rules = settings.ai.usage.rules;
						}

						var responseData =
						{
							"models": models,
							"usage": usage
						}

						entityos.invoke('util-end',
						{
							method: 'ai-gen-get-models',
							status: 'OK',
							data: responseData
						},
						'200');
					}
				}
			});

			entityos.add(
			{
				name: 'app-process-ai-gen-chat',
				code: function ()
				{
					var data = entityos.get({scope: '_data'});
					var settings = entityos.get({scope: '_settings'});

					if (data == undefined)
					{
						entityos.invoke('util-end', 
						{
							error: 'Missing data.'
						},
						'403');
					}
					else
					{
						let aiSettings = entityos.invoke('ai-gen-util-get-settings');

						if (aiSettings == undefined)
						{
							entityos.invoke('util-end', 
							{
								error: 'Not a valid model name. Use ai-gen-get-models method for find valid models.'
							},
							'403');
						}
						else
						{
							let allMessages = _.get(data, 'messages.all', []);
							let chatMessages;

							if (allMessages.length == 0)
							{
								var userMessage = _.unescape(_.get(data, 'messages.user'));

								const systemMessageDefault = _.get(settings, 'ai.defaults.messages.system', 'You are a caring learning assistant.');
								const systemMessage = _.unescape(_.get(data, 'ai.defaults.messages.system', systemMessageDefault));

								chatMessages = {
									system: systemMessage,
									user: userMessage
								}
							}
							else
							{
								chatMessages = {all: allMessages}
							}

							var param = 
							{
								model: data.model,
								settings: aiSettings,
								maxTokens: _.get(data, 'maxtokens'),
								temperature: _.get(data, 'temperature'),
								messages: chatMessages,
								onComplete: 'app-process-ai-gen-chat-response'
							}

							let modelSettings = _.get(data, 'modelSettings');
							
							if (modelSettings != undefined)
							{
								// !!TODO: Santize settings - make util- function
								_.set(param, 'modelSettings', modelSettings)
							}

							let controller = 'ai-gen-util-chat';

							if (_.has(aiSettings, 'service.controller'))
							{
								controller = aiSettings.service.controller;
							}

							entityos.invoke(controller, param);
						}
					}
				}
			});

			entityos.add(
			{
				name: 'app-process-ai-gen-chat-response',
				code: function (param, response)
				{
					var responseData =
					{
						"messages": {"response": param.messages.response}
					}

					entityos.invoke('util-end',
					{
						method: 'ai-gen-chat',
						status: 'OK',
						data: responseData
					},
					'200');
				}
			});

			// !!!! APP STARTS HERE; Initialise the app; app-init invokes app-start if authentication OK
			entityos.invoke('app-init');
		}	
   });

  	return promise
}