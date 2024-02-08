# entityos-learn-ai

Learn how to use entityOS & AI Services

In this example the node app (as entityOS user) is looking for conversation (set by UUID/GUID in the event..json) that it is a participant in, for posts that have a subject containing @genai or @heyocto.  It then passes the message to the GenAI service (in this example OpenAI) and then saves the response as a comment to the orginal post.

Example uses OpenAI, but you can change to any service you wish.

You can also change to Python using https://github.com/ibcom-lab/entityos-learn-python as your starting point.



