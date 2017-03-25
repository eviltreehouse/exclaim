## Exclaim!

This is a simple tool for providing a network-connectable logging facility to have up when doing
JavaScript game dev w/o needing to have the cumbersome Web Console open. It also will support:

- built-in JavaScript client for web applications
- colors
- emoji! https://raw.githubusercontent.com/omnidan/node-emoji/master/lib/emoji.json
- contexts / filters - interactive CLI
- run iterartions (FUTURE?)
- templates
- log archiving (FUTURE?)
- accept form-encoded or JSON (/log, /log.json)

### Tool Functionality

**Basic Usage**

Fire up the ```exclaim.js``` script and specify a port # to listen on (there is no security layer so be warned!):
```
node exclaim.js 18101
```

It will now be in its default listening mode, which is essentially 'show all'. To send simple messages over, simply issue *POSTs* to the interface/port with the following structure:
```
http://localhost:18101/log
(send a POST body formatted like: msg=_your-message-data_)
```
Message content can be anything you'd need: they may include color attributes in order to highlight certain elements, as well as _:emoji-symbols:_ to dress up on your console output even further if your Node installation supports it. 

In order to help the "signal vs noise" problem with applications w/ large amounts of output, you can
qualify your messages by extending your POST envelope:
```
msg=_your-message-data_&ctx=_your-message-context_
```

**Message Contexts**

Contexts are like grouping tags that will be part of the output in your console window to help you
hone in on the content you are looking for. They are also how you can filter in/out messages from
display so you can output _only_ the content you are searching for. Contexts, like the ``logger`` package, 
are made up of a major/minor tuple, e.g. ```app:account-io``` or ```sys:fs-engine```. Typical usage
patterns would involve activating the console filter to show ```app:*```, ```*:errors```, or ```*:*```. 


**Color/Font Attributes**

Wrap the message content you want affected like so: ```Lets show some {{red}red text}}```. In addition to basic ANSI colors, you can also use font attributes like _underline_ or _bold_. 


**Run Iterations (Sessions)**

*re-write to match new methodology*
For situations where grouping messages into a logical context instead of a global context is preferable,
e.g. a particular build test, you can register your client connection with an _iteration ID_ and all
further messages sent via that connection instance will be stored and archived in its own separate 
compartment and archived accordingly (when archiving is enabled.) Visually in the tool, it will make
a subtle font separation as you go from iteration ID to iteration ID so you can easily compare output
from two different iterations within the same context, for example.
```
// All messages sent after this GET will be grouped into it until another one is requested.
// As such, this feature is really only beneifical in its current state for doing
// static and synchronous logging. 
GET /log/new_instance => {"success":true,id:"13fea41bca90"}
```


**~~Message Templates~~**

~~If you want output formatted in a particular fashion but don't want to have to provide all the
pieces of the "grooming" content repeatedly. You can submit _templates_ to the script and it will
maintain, while running, these templates and apply them to messages as they come in.~~


**Interactive CLI**

While the app is running, you can press the [Enter] and define the active context filter you want to
employ, concluding with [Enter] to resume output mode. In addition to providing the contexts you wish
to see, you can also provide a general search term that will be highlighted in messages as they come in to make indentifying specific messages easier. You may also request a 'replay' after changing the filter to run the last _x_ messages back through the filter engine again by simply entering the # of lines as the filter definition. 

Pressing [Enter] twice will display the current active filter definition. You may add or remove pieces of your filter definition instead of re-specifying the entire definition by using _partial definitions_. You can delete your entire filter definition by submitting "all", "*", or "-" as your definition which will go back to 'display all' mode. 

~~**Remote CLI Filter**~~

~~You can change the active CLI filter by executing special POSTs from the client-side.~~

**Log Archive Review**

Surfing to a special URI will present the user with all the logging data gathered from the application's lifespan, broken
doing by iteration. There should be no real functional UI: let the browser do all the work for helping the user find stuff.