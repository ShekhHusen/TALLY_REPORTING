const fs = require('fs');
const content = fs.readFileSync('src/components/FollowUpsTab.jsx', 'utf-8');

const startIdx = content.indexOf(`                const statusColors = {`);
const endIdx = content.indexOf(`              })`, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const prefix = content.slice(0, startIdx);
    const suffix = content.slice(endIdx);
    const newContent = `                const statusStyles = {
                  'Today': { label: 'Due Today', color: 'bg-amber-100 text-amber-900 border-amber-300', stripe: 'bg-amber-500', icon: <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" /> },
                  'Overdue': { label: 'Overdue', color: 'bg-red-100 text-red-800 border-red-200', stripe: 'bg-red-500', icon: <AlertCircle className="w-3.5 h-3.5 mr-1 text-red-600" /> },
                  'Upcoming': { label: 'Upcoming', color: 'bg-blue-100 text-blue-800 border-blue-200', stripe: 'bg-blue-500', icon: <Calendar className="w-3.5 h-3.5 mr-1 text-blue-600" /> },
                  'Completed': { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-200', stripe: 'bg-green-500', icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> },
                  'Pending': { label: 'Pending', color: 'bg-gray-100 text-gray-800 border-gray-200', stripe: 'bg-gray-400', icon: <Clock className="w-3.5 h-3.5 mr-1 text-gray-600" /> }
                };
                const currentStyle = statusStyles[status] || statusStyles['Pending'];

                return (
                  <div key={fu.id} className="bg-white border border-gray-100 rounded-xl shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                    {/* Color stripe on the left */}
                    <div className={\`absolute left-0 top-0 bottom-0 w-1.5 \${currentStyle.stripe}\`}></div>
                    
                    <div className="p-4 pl-5">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center space-x-2.5">
                          <span className={\`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border \${currentStyle.color}\`}>
                            {currentStyle.icon}
                            {currentStyle.label}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-gray-500 flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                          <User className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                          {fu.userName}
                        </div>
                      </div>

                      {/* Account Name */}
                      <h4 className="font-extrabold text-sm text-gray-900 leading-tight mb-2 truncate" title={fu.accountName}>
                        {fu.accountName}
                      </h4>
                      
                      {/* Message */}
                      <div className="text-gray-800 text-sm font-medium leading-relaxed whitespace-pre-wrap">
                        {fu.message}
                      </div>

                      {/* Latest Call Info if present */}
                      {fu.lastCallNote && (
                        <div className="mt-3 text-xs text-blue-900 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 flex items-start gap-2">
                          <PhoneCall className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-blue-800">Latest Call:</span> <span className="font-medium text-gray-700">{fu.lastCallNote}</span>{' '}
                            <span className="text-blue-600 font-bold block mt-0.5">({fu.lastCallBy || 'User'} on {fu.lastCallDate})</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Card Footer: Next Date, Assigned, and Action buttons */}
                      <div className={\`mt-4 pt-3 border-t border-gray-100 flex \${fu.completed ? 'flex-col' : 'flex-wrap items-center justify-between'} gap-3 text-xs text-gray-600\`}>
                        {!fu.completed && (
                          <div className="flex items-center gap-4">
                            {fu.nextFollowUpDate && (
                              <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Next Follow-up</span>
                                <b className="text-blue-700 text-xs mt-0.5">{fu.nextFollowUpDate}</b>
                              </div>
                            )}
                            {fu.assignedTo && (
                              <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Assigned To</span>
                                <span className="font-bold text-gray-700 text-xs mt-0.5">{fu.assignedTo}</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className={\`flex flex-wrap items-center gap-2 \${fu.completed ? 'w-full' : ''}\`}>
                          {!fu.completed && (
                            <button
                              type="button"
                              onClick={() => handleOpenUpdate(fu)}
                              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg font-bold transition-colors inline-flex items-center gap-1.5 shrink-0"
                            >
                              <PhoneCall className="w-3.5 h-3.5" /> Resched.
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenUpdate(fu)}
                            className={\`px-3 py-1.5 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg font-bold transition-colors inline-flex items-center justify-center gap-1.5 shrink-0 \${fu.completed ? 'w-full py-2.5' : ''}\`}
                          >
                            <History className="w-3.5 h-3.5" /> History ({historyCount})
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => handleOpenStatement(fu.accountName)}
                            className={\`px-3 py-1.5 bg-white text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg font-bold transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm shrink-0 \${fu.completed ? 'w-full py-2.5' : ''}\`}
                          >
                             <FileText className="w-3.5 h-3.5" /> Stmt
                          </button>
                          {!fu.completed && (
                            <button
                              type="button"
                              onClick={() => handleMarkComplete(fu)}
                              className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg font-bold transition-colors inline-flex items-center justify-center gap-1.5 shrink-0"
                            >
                               <Check className="w-3.5 h-3.5" /> Complete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
`;
    fs.writeFileSync('src/components/FollowUpsTab.jsx', prefix + newContent + suffix);
    console.log("Successfully replaced content.");
} else {
    console.log("Could not find start or end index.");
}
