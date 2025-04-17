/*
	See:
	https://learn-next.entityos.cloud/learn-function-automation

	This is node app to automate tasks
	https://www.npmjs.com/package/lambda-local:

	lambda-local -l index.js -t 9000 -e event-ai-gen-util-service-models-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-util-service-models-aws-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-util-file-to-base64-lab.json

	lambda-local -l index.js -t 9000 -e event-ai-gen-chat-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-chat-google-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-chat-with-attachment-lab.json

	lambda-local -l index.js -t 9000 -e event-ai-gen-chat-xai-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-chat-xai-with-attachment-lab.json
	
	lambda-local -l index.js -t 9000 -e event-ai-gen-conversation-chat-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-conversation-chat-mistral-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-conversation-chat-groq-mistral-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-conversation-chat-claude-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-conversation-chat-groq-llama-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-conversation-chat-openai-lab.json
	lambda-local -l index.js -t 9000 -e event-ai-gen-conversation-chat-google-lab.json

	zip -r ../entityos-ai-DDMMMYYYY.zip *

	//TODO: Use conversation description to hold "System" message
	// Upload base64 image
*/

exports.handler = function (event, context, callback)
{
	var entityos = require('entityos')
	var _ = require('lodash')
	var moment = require('moment');

	entityos.set(
	{
		scope: '_event',
		value: event
	});

	entityos.set(
	{
		scope: '_data',
		value: event
	});

	entityos.set(
	{
		scope: '_context',
		value: context
	});

	entityos.set(
	{
		scope: '_callback',
		value: callback
	});

	var settings;

	if (event != undefined)
	{
		if (event.site != undefined)
		{
			settings = event.site;
		}
        else if (event.settings != undefined)
		{
			settings = event.settings;
		}
		else
		{
			settings = event;
		}
	}

	entityos._util.message(
	[
		'-',
		'EVENT-SETTINGS:',
		settings
	]);

	entityos.init(main, settings)
	entityos._util.message('Using entityos module version ' + entityos.VERSION);
	
	function main(init)
	{
		console.log(init);

		entityos.add(
		{
			name: 'util-log',
			code: function (data)
			{
				entityos.cloud.save(
				{
					object: 'core_debug_log',
					data: data
				});
			}
		});

		entityos.add(
		{
			name: 'util-end',
			code: function (data, error)
			{
				var callback = entityos.get(
				{
					scope: '_callback'
				});

				if (error == undefined) {error = null}

				if (callback != undefined)
				{
					callback(error, data);
				}
			}
		});

		if (init.data.status == 'ER')
		{
			entityos.invoke('util-end', init.data)
		}
		else
		{
			var settings = entityos.get({scope: '_settings'});
			var event = entityos.get({scope: '_event'});

			entityos._util.message(settings);

			var namespace = event.namespace;
			
			if (namespace == undefined)
			{
				namespace = _.get(settings, 'ai.defaults.namespace');
			}

			if (namespace != undefined)
			{
				entityos._util.message('Loading namespace: ' + namespace);

				var aifactory = require('aifactory/aifactory.' + namespace + '.js');

				if (_.has(aifactory, 'init'))
				{
					aifactory.init();
				}
			}

			var namespaces = event.namespaces;
			
			if (namespaces == undefined)
			{
				namespaces = _.get(settings, 'ai.default.namespaces');
			}

			if (namespaces != undefined)
			{
				var _namespaces = {};
				_.each(namespaces, function (namespace)
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

			console.log(aiSettings)

			const serviceNamespace = _.get(aiSettings, 'service.namespace');

			if (serviceNamespace != undefined)
			{
				entityos._util.message('Loading service namespace: ' + serviceNamespace);
				const servicefactory = require('aifactory/aifactory.' + serviceNamespace + '.js');

				if (_.has(servicefactory, 'init'))
				{
					servicefactory.init();
				}
			}

			//- GEN CHAT

			entityos.add(
			{
				name: 'ai-gen-chat',
				code: function ()
				{
					var event = entityos.get({scope: '_event'});
					var settings = entityos.get({scope: '_settings'});

					let aiSettings = entityos.invoke('ai-gen-util-get-settings');

					if (aiSettings == undefined)
					{
						entityos.invoke('util-end', 
						{
							error: 'Not a valid model name. Use ai-gen-util-get-models method for find valid models.'
						});
					}
					else
					{
						let userMessage = _.unescape(_.get(event, 'messages.user'));
						const systemMessageDefault = _.get(settings, 'ai.defaults.messages.system');
						let systemMessage = _.unescape(_.get(event, 'messages.system', systemMessageDefault));

						var param = 
						{
							model: event.model,
							settings: aiSettings,
							maxTokens: _.get(event, 'maxtokens'),
							temperature: _.get(event, 'temperature'),
							messages:
							{
								system: systemMessage,
								user: userMessage
							},
							attachments: _.get(event, 'attachments'),
							onComplete: 'ai-gen-chat-response'
						}

						let modelSettings = _.get(event, 'modelSettings');
						
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
			});

			entityos.add(
			{
				name: 'ai-gen-chat-response',
				code: function (param)
				{
					console.log(param)
					var responseData =
					{
						"service": {"name": _.get(param, 'settings.service.name')},
						"model": _.get(param, 'settings.model'),
						"messages": {"response": param.messages.response}
					}

					entityos.invoke('util-end',
					{
						method: 'ai-gen-chat',
						data: responseData
					});
				}
			});

			//- GEN ENTITYOS CONVERSATION CHAT

			entityos.add(
			{
				name: 'ai-gen-conversation-chat',
				code: function (param)
				{
					var event = entityos.get({scope: '_event'});

					entityos.cloud.search(
					{
						object: 'messaging_conversation',
						fields: [{name: 'title'}],
						filters:
						[
							{
								field: 'guid',
								comparison: 'EQUAL_TO',
								value: event.conversation.uuid
							}
						],
						callback: 'ai-gen-conversation-chat-response'
					});
				}
			});

			entityos.add(
			{
				name: 'ai-gen-conversation-chat-response',
				code: function (param, response)
				{
					var event = entityos.get({scope: '_event'});

					if (response.status == 'ER')
					{
						entityos.invoke('util-end', {error: 'Error retrieving the conversation [' + event.conversation.uuid + ']'}, '401');
					}
					else
					{
						if (response.data.rows.length == 0)
						{
							entityos.invoke('util-end', {error: 'Bad event.ai.conversation.uuid [' + event.conversation.uuid + ']'}, '401');
						}
						else
						{
							event._conversation = _.first(response.data.rows);
							entityos.set({scope: '_event', value: event});
							entityos.invoke('ai-gen-conversation-chat-posts', param)
						}
					}
				}
			});

			//- GET CONVERSATION POSTS

			entityos.add(
			{
				name: 'ai-gen-conversation-chat-posts',
				code: function (param)
				{
					var event = entityos.get({scope: '_event'});

					entityos.cloud.search(
					{
						object: 'messaging_conversation_post',
						fields: [{name: 'subject'}, {name: 'message'}, {name: 'guid'}],
						filters:
						[],
						customOptions:
						[
							{
								name: 'conversation',
								value: event._conversation.id
							}
						],
						callback: 'ai-gen-conversation-chat-posts-response'
					});
				}
			});

			entityos.add(
			{
				name: 'ai-gen-conversation-chat-posts-response',
				code: function (param, response)
				{
					var event = entityos.get({scope: '_event'});

					if (response.status == 'ER')
					{
						entityos.invoke('util-end', {error: 'Error retrieving the conversation posts [' + event.conversation.uuid + ']'}, '401');
					}
					else
					{	
						event._posts = {all: response.data.rows};
						entityos.set({scope: '_event', value: event});
						//entityos.invoke('util-end', event)
						entityos.invoke('ai-gen-conversation-chat-posts-process', param);

						//!!!! GET THE ATTRIBUTES OF THE USER THAT POSTED AND USE FOR systemMessage
							// About me = URI: 00010000230000 (Understanding of Self)
							// Believes About Yourself = URI: 00010000250000 (Believe in Self)
							// Learning Communication Style = URI: 00010000040000 (Communication)
							// Can also include attributes with percentages if they have been set - look at the latest action.
							// skillzeb.io
					}
				}
			});

			//- PROCESS CONVERSATION POSTS WITH @GENAI IN THE SUBJECT

			entityos.add(
			{
				name: 'ai-gen-conversation-chat-posts-process',
				code: function (param)
				{
					var event = entityos.get({scope: '_event'});

					event._posts.genai = _.filter(event._posts.all, function (post)
					{
						return (_.includes(_.toLower(post.subject), '@genai:') || _.includes(_.toLower(post.subject), '@heyocto:'))
					});

					if (event._posts.genai.length == 0)
					{
						entityos.invoke('ai-gen-conversation-chat-complete');
					}
					else
					{
						event._posts._indexGenAIProcessing = 0;
						entityos.set({scope: '_event', value: event});
						entityos.invoke('ai-gen-conversation-chat-posts-process-genai');
					}
				}
			});

			entityos.add(
			{
				name: 'ai-gen-conversation-chat-posts-process-genai',
				code: function (param)
				{
					var event = entityos.get({scope: '_event'});

					if (event._posts._indexGenAIProcessing < event._posts.genai.length)
					{
						var post = event._posts.genai[event._posts._indexGenAIProcessing];

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
							const userMessage = _.unescape(post.message);
							const messageSystemsDefault = _.get(data, 'ai.defaults.messages.system', 'You are a learning assistant for a young person');

							var param = 
							{
								model: data.model,
								settings: aiSettings,
								maxTokens: _.get(data, 'maxtokens'),
								temperature: _.get(data, 'temperature'),
								messages:
								{
									system: messageSystemsDefault,
									user: userMessage
								},
								onComplete: 'ai-gen-conversation-chat-posts-process-genai-save'
							}

							let modelSettings = _.get(data, 'modelSettings');
							
							if (modelSettings != undefined)
							{
								// !!TODO: Santize settings - make util- function
								_.set(param, 'modelSettings', modelSettings)
							}

							entityos.invoke('ai-gen-util-chat', param);
						}
					}
					else
					{
						entityos.invoke('ai-gen-conversation-chat-complete');
					}
				}
			});

			entityos.add(
			{
				name: 'ai-gen-conversation-chat-posts-process-genai-save',
				code: function (param, response)
				{
					var event = entityos.get({scope: '_event'});
					var post = event._posts.genai[event._posts._indexGenAIProcessing];

					if (response == undefined)
					{
						post.gptMessage = param.gptMessage;

						var saveData =
						{	
							conversation: event._conversation.id,
							post: post.id,
							subject: _.replace(post.subject, '@genai:', '@genai:response:') + ':' + event._model,
							message: _.truncate(post.gptMessage, {length: 8000})
						}
				
						console.log(saveData);

						entityos.cloud.save(
						{
							object: 'messaging_conversation_post_comment',
							data: saveData,
							callback: 'ai-gen-conversation-chat-posts-process-genai-save',
							callbackParam: param
						});
					}
					else
					{
						post._messagingConversation = {id: response.id};
						entityos.invoke('ai-gen-conversation-chat-posts-process-genai-next', param);
					}
				}
			});

			entityos.add(
			{
				name: 'ai-gen-conversation-chat-posts-process-genai-next',
				code: function (param)
				{
					var event = entityos.get({scope: '_event'});

					event._posts.genai[event._posts._indexGenAIProcessing].gptMessage = param.gptMessage;

					event._posts._indexGenAIProcessing = (event._posts._indexGenAIProcessing + 1)
					entityos.set({scope: '_event', value: event});

					entityos.invoke('ai-gen-conversation-chat-posts-process-genai');
				}
			});

			entityos.add(
			{
				name: 'ai-gen-conversation-chat-complete',
				code: function (param)
				{
					var event = entityos.get({scope: '_event'});
					entityos.invoke('util-end', event)
				}
			});
			
			/* STARTS HERE! */

			var event = entityos.get({scope: '_event'});

			var controller = event.controller;
			if (controller == undefined)
			{
				controller = 'ai-start'
			}

			entityos.invoke(controller);
		}
	}
}