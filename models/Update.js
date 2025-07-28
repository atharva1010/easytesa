const updateSchema = new mongoose.Schema({
  title: String,
  message: String,
  imageUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});
const Update = mongoose.model("Update", updateSchema);
