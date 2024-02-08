/*
	See:
	https://learn-next.entityos.cloud/learn-function-automation

	This is node app to automate tasks
	https://www.npmjs.com/package/lambda-local:

	lambda-local -l index.js -t 9000 -e event-ai-util-gpt.json
	lambda-local -l index.js -t 9000 -e event-ai-conversation-chat.json
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

			entityos._util.message(
			[
				'-',
				'SETTINGS:',
				settings
			]);

			var namespace = settings.ai.namespace;

			if (event.namespace != undefined) {namespace = event.namespace;}
			if (namespace != undefined)
			{
				entityos._util.message(
				[
					'-',
					'NAMESPACE:',
					namespace
				]);

				var aifactory = require('aifactory/aifactory.' + namespace + '.js');

				if (_.has(aifactory, 'init'))
				{
					aifactory.init();
				}
			}

			var namespaces = settings.ai.namespaces;

			if (event.namespaces != undefined) {namespaces = event.namespaces;}
			if (namespaces != undefined)
			{
				entityos._util.message(
				[
					'-',
					'NAMESPACES:'
				]);

				var _namespaces = {};
				_.each(namespaces, function (namespace)
				{
					entityos._util.message([namespace]);

					_namespaces[namespace] = require('aifactory/aifactory.' + namespace + '.js');
					if (_.has(_namespaces[namespace], 'init'))
					{
						_namespaces[namespace].init();
					}
				});
			}

			//- GET CONVERSATION

			entityos.add(
			{
				name: 'ai-conversation-chat',
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
						callback: 'ai-conversation-chat-response'
					});
				}
			});

			entityos.add(
			{
				name: 'ai-conversation-chat-response',
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
							entityos.invoke('ai-conversation-chat-posts', param)
						}
					}
				}
			});

			//- GET CONVERSATION POSTS

			entityos.add(
			{
				name: 'ai-conversation-chat-posts',
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
						callback: 'ai-conversation-chat-posts-response'
					});
				}
			});

			entityos.add(
			{
				name: 'ai-conversation-chat-posts-response',
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
						entityos.invoke('ai-conversation-chat-posts-process', param)	
					}
				}
			});

			//- PROCESS CONVERSATION POSTS WITH @GENAI IN THE SUBJECT

			entityos.add(
			{
				name: 'ai-conversation-chat-posts-process',
				code: function (param)
				{
					var event = entityos.get({scope: '_event'});

					event._posts.genai = _.filter(event._posts.all, function (post)
					{
						return (_.includes(_.toLower(post.subject), '@genai:') || _.includes(_.toLower(post.subject), '@heyocto:'))
					});

					if (event._posts.genai.length == 0)
					{
						entityos.invoke('ai-conversation-chat-complete');
					}
					else
					{
						event._posts._indexGenAIProcessing = 0;
						entityos.set({scope: '_event', value: event});
						entityos.invoke('ai-conversation-chat-posts-process-genai');
					}
				}
			});

			entityos.add(
			{
				name: 'ai-conversation-chat-posts-process-genai',
				code: function (param)
				{
					var event = entityos.get({scope: '_event'});

					if (event._posts._indexGenAIProcessing < event._posts.genai.length)
					{
						var post = event._posts.genai[event._posts._indexGenAIProcessing];

						var userMessage = _.unescape(post.message);
						console.log(userMessage);

						var param = 
						{
							messages:
							{
								system: 'You are a learning assistant for a young person',
								user: userMessage
							},
							onComplete: 'ai-conversation-chat-posts-process-genai-save'
						}

						entityos.invoke('ai-util-gpt', param);
					}
					else
					{
						entityos.invoke('ai-conversation-chat-complete');
					}
				}
			});

			entityos.add(
			{
				name: 'ai-conversation-chat-posts-process-genai-save',
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
							subject: _.replace(post.subject, '@genai:', '@genai:response:'),
							message: _.truncate(post.gptMessage, {length: 8000})
						}
				
						console.log(saveData);

						entityos.cloud.save(
						{
							object: 'messaging_conversation_post_comment',
							data: saveData,
							callback: 'ai-conversation-chat-posts-process-genai-save',
							callbackParam: param
						});
					}
					else
					{
						post._messagingConversation = {id: response.id};
						entityos.invoke('ai-conversation-chat-posts-process-genai-next', param);
					}
				}
			});

			entityos.add(
			{
				name: 'ai-conversation-chat-posts-process-genai-next',
				code: function (param)
				{
					var event = entityos.get({scope: '_event'});

					event._posts.genai[event._posts._indexGenAIProcessing].gptMessage = param.gptMessage;

					event._posts._indexGenAIProcessing = (event._posts._indexGenAIProcessing + 1)
					entityos.set({scope: '_event', value: event});

					entityos.invoke('ai-conversation-chat-posts-process-genai');
				}
			});

			entityos.add(
			{
				name: 'ai-conversation-chat-complete',
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